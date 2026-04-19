"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transport = void 0;
const otlp_js_1 = require("./otlp.js");
const retry_queue_js_1 = require("./retry-queue.js");
const TIMEOUT_MS = 5000;
class Transport {
    config;
    queue;
    constructor(config) {
        this.config = config;
        this.queue = new retry_queue_js_1.RetryQueue(config.pluginData);
    }
    /**
     * POST a single payload. On any failure, enqueue it for the next hook to retry.
     * Never throws — handlers must always reach exit 0/1/2 deterministically.
     */
    async send(payload) {
        const ok = await this.post(payload);
        if (!ok)
            this.queue.enqueue(payload);
    }
    /**
     * Best-effort drain. Acquires the lock, reads the queue, attempts a single
     * batched POST. On failure, leaves the queue untouched. Lock-acquire failure
     * is silent — the next hook will try.
     */
    async flush() {
        if (!this.queue.tryAcquireLock())
            return;
        try {
            const entries = this.queue.readAll();
            if (entries.length === 0)
                return;
            const merged = (0, otlp_js_1.mergeBatch)(entries.map((e) => e.payload));
            const ok = await this.post(merged);
            if (ok)
                this.queue.rewrite([]);
        }
        finally {
            this.queue.release();
        }
    }
    async post(payload) {
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
        }
        catch (err) {
            process.stderr.write(`[pinta-cc] POST /traces failed: ${err}\n`);
            return false;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.Transport = Transport;
//# sourceMappingURL=transport.js.map