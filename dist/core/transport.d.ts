import type { PintaConfig } from "./config.js";
import type { OtlpPayload } from "./otlp.js";
export declare class Transport {
    private config;
    private queue;
    constructor(config: PintaConfig);
    /**
     * POST a single payload. On any failure, enqueue it for the next hook to retry.
     * Never throws — handlers must always reach exit 0/1/2 deterministically.
     */
    send(payload: OtlpPayload): Promise<void>;
    /**
     * Best-effort drain. Acquires the lock, reads the queue, attempts a single
     * batched POST. On failure, leaves the queue untouched. Lock-acquire failure
     * is silent — the next hook will try.
     */
    flush(): Promise<void>;
    private post;
}
