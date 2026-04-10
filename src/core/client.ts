import type { PintaConfig } from "./config.js";
import type { PintaEvent, Rule } from "./types.js";

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export class PintaClient {
  private config: PintaConfig;

  constructor(config: PintaConfig) {
    this.config = config;
  }

  async sendEvent(event: PintaEvent): Promise<void> {
    await this.postWithRetry(`${this.config.serverUrl}/api/events`, event);
  }

  async sendEventAsync(event: PintaEvent): Promise<void> {
    try {
      await this.sendEvent(event);
    } catch {
      // 전송 실패해도 무시 — 로깅용이므로 블로킹하지 않음
    }
  }

  async fetchRules(): Promise<{ rules: Rule[]; version: string }> {
    const response = await this.fetchWithTimeout(`${this.config.serverUrl}/api/rules`, {
      method: "GET",
      headers: this.headers(),
    });
    return response.json() as Promise<{ rules: Rule[]; version: string }>;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.serverUrl}/api/health`, {
        method: "GET",
        headers: this.headers(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.authToken}`,
    };
  }

  private async postWithRetry(url: string, body: unknown): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        });
        if (response.ok) return;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < MAX_RETRIES - 1) {
        await this.sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
      }
    }
    throw lastError;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
