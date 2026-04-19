"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PintaGuardClient = void 0;
const TIMEOUT_MS = 5000;
class PintaGuardClient {
    config;
    constructor(config) {
        this.config = config;
    }
    async evaluate(payload) {
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
            return (await res.json());
        }
        catch (err) {
            process.stderr.write(`[pinta-cc] POST /guard failed: ${err}\n`);
            return null;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.PintaGuardClient = PintaGuardClient;
//# sourceMappingURL=pinta-guard.js.map