import type { PintaConfig } from "../core/config.js";
import type { GuardClient, GuardResponse } from "../core/guard.js";
import type { OtlpPayload } from "../core/otlp.js";

const TIMEOUT_MS = 5000;

export class PintaGuardClient implements GuardClient {
  constructor(private config: PintaConfig) {}

  async evaluate(payload: OtlpPayload): Promise<GuardResponse | null> {
    const url = `${this.config.endpoint}/guard`;
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
        process.stderr.write(`[pinta-cc] POST /guard failed: HTTP ${res.status}\n`);
        return null;
      }
      return (await res.json()) as GuardResponse;
    } catch (err) {
      process.stderr.write(`[pinta-cc] POST /guard failed: ${err}\n`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
