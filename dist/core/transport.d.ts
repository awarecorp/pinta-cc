import type { OtlpPayload } from "./otlp.js";
import type { PintaConfig } from "./config.js";
export declare class Transport {
    private queue;
    constructor(config: PintaConfig);
    /**
     * POST a single payload. On any failure, enqueue it for the next hook to retry.
     * Silent disable when no endpoint is configured.
     */
    send(payload: OtlpPayload): Promise<void>;
    /**
     * Best-effort drain. Acquires the lock, reads the queue, attempts a single
     * batched POST. On failure, leaves the queue untouched.
     * Silent disable when no endpoint is configured.
     */
    flush(): Promise<void>;
    private post;
}
