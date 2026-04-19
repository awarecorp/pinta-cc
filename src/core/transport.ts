import type { PintaConfig } from "./config.js";
import type { OtlpPayload } from "./otlp.js";
import { mergeBatch } from "./otlp.js";
import { RetryQueue } from "./retry-queue.js";

const TIMEOUT_MS = 5000;

export class Transport {
  private config: PintaConfig;
  private queue: RetryQueue;

  constructor(config: PintaConfig) {
    this.config = config;
    this.queue = new RetryQueue(config.pluginData);
  }

  /**
   * POST a single payload. On any failure, enqueue it for the next hook to retry.
   * Never throws — handlers must always reach exit 0/1/2 deterministically.
   */
  async send(payload: OtlpPayload): Promise<void> {
    const ok = await this.post(payload);
    if (!ok) this.queue.enqueue(payload);
  }

  /**
   * Best-effort drain. Acquires the lock, reads the queue, attempts a single
   * batched POST. On failure, leaves the queue untouched. Lock-acquire failure
   * is silent — the next hook will try.
   */
  async flush(): Promise<void> {
    if (!this.queue.tryAcquireLock()) return;
    try {
      const entries = this.queue.readAll();
      if (entries.length === 0) return;
      const merged = mergeBatch(entries.map((e) => e.payload));
      const ok = await this.post(merged);
      if (ok) this.queue.rewrite([]);
    } finally {
      this.queue.release();
    }
  }

  private async post(payload: OtlpPayload): Promise<boolean> {
    const url = `${this.config.endpoint}/traces`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        process.stderr.write(`[pinta-cc] POST /traces failed: HTTP ${res.status}\n`);
        return false;
      }
      return true;
    } catch (err) {
      process.stderr.write(`[pinta-cc] POST /traces failed: ${err}\n`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
