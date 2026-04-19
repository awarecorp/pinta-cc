import type { OtlpPayload } from "./otlp.js";
export interface QueueEntry {
    savedAt: string;
    payload: OtlpPayload;
}
export declare class RetryQueue {
    private filePath;
    private lockPath;
    constructor(pluginData: string);
    /** Append a single payload. Best-effort: any IO error is swallowed (logged to stderr). */
    enqueue(payload: OtlpPayload): void;
    /**
     * Read all entries oldest-first. Returns [] if the file does not exist or is unreadable.
     * Does NOT delete the file — callers handle persistence via `rewrite`.
     */
    readAll(): QueueEntry[];
    /** Replace the queue with the given entries (or delete the file when empty). */
    rewrite(entries: QueueEntry[]): void;
    /**
     * Try to acquire the lock for ~LOCK_TIMEOUT_MS. Returns true on success.
     * Caller MUST call `release()` if true is returned.
     */
    tryAcquireLock(): boolean;
    release(): void;
    private trim;
}
