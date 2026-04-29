import { RetryQueue } from "./retry-queue.js";
import type { OtlpPayload } from "./otlp.js";
import { mergeBatch } from "./otlp.js";
import type { PintaConfig } from "./config.js";

const TIMEOUT_MS = 5000;

interface TransportOptions {
  endpoint: string;
  headers: Record<string, string>;
}

function parseHeadersEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [k, ...rest] = pair.split("=");
    if (k && rest.length > 0) out[k.trim()] = rest.join("=").trim();
  }
  return out;
}

function getOptions(): TransportOptions | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    headers: parseHeadersEnv(process.env.OTEL_EXPORTER_OTLP_HEADERS),
  };
}

export class Transport {
  private queue: RetryQueue;

  constructor(config: PintaConfig) {
    this.queue = new RetryQueue(config.pluginData);
  }

  /**
   * POST a single payload. On any failure, enqueue it for the next hook to retry.
   * Silent disable when no endpoint is configured.
   */
  async send(payload: OtlpPayload): Promise<void> {
    const opts = getOptions();
    if (!opts) return; // Silent disable when no endpoint configured
    const ok = await this.post(payload, opts);
    if (!ok) this.queue.enqueue(payload);
  }

  /**
   * Best-effort drain. Acquires the lock, reads the queue, attempts a single
   * batched POST. On failure, leaves the queue untouched.
   * Silent disable when no endpoint is configured.
   */
  async flush(): Promise<void> {
    const opts = getOptions();
    if (!opts) return;
    if (!this.queue.tryAcquireLock()) return;
    try {
      const entries = this.queue.readAll();
      if (entries.length === 0) return;
      const merged = mergeBatch(entries.map((e) => e.payload));
      const ok = await this.post(merged, opts);
      if (ok) this.queue.rewrite([]);
    } finally {
      this.queue.release();
    }
  }

  private async post(payload: OtlpPayload, opts: TransportOptions): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${opts.endpoint}/traces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        process.stderr.write(`[pinta-cc] OTLP POST ${res.status}\n`);
        return false;
      }
      return true;
    } catch (err) {
      process.stderr.write(
        `[pinta-cc] OTLP POST failed: ${(err as Error).message ?? String(err)}\n`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
