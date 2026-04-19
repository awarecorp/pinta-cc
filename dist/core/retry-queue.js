"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryQueue = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MAX_ENTRIES = 1000;
const LOCK_TIMEOUT_MS = 50;
const LOCK_POLL_MS = 5;
class RetryQueue {
    filePath;
    lockPath;
    constructor(pluginData) {
        this.filePath = path_1.default.join(pluginData, "failed-spans.jsonl");
        this.lockPath = this.filePath + ".lock";
    }
    /** Append a single payload. Best-effort: any IO error is swallowed (logged to stderr). */
    enqueue(payload) {
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(this.filePath), { recursive: true });
            const line = JSON.stringify({ savedAt: new Date().toISOString(), payload }) + "\n";
            fs_1.default.appendFileSync(this.filePath, line);
            this.trim();
        }
        catch (err) {
            process.stderr.write(`[pinta-cc] retry-queue enqueue failed: ${err}\n`);
        }
    }
    /**
     * Read all entries oldest-first. Returns [] if the file does not exist or is unreadable.
     * Does NOT delete the file — callers handle persistence via `rewrite`.
     */
    readAll() {
        try {
            const raw = fs_1.default.readFileSync(this.filePath, "utf-8");
            const out = [];
            for (const line of raw.split("\n")) {
                if (!line.trim())
                    continue;
                try {
                    out.push(JSON.parse(line));
                }
                catch {
                    // skip malformed line
                }
            }
            return out;
        }
        catch {
            return [];
        }
    }
    /** Replace the queue with the given entries (or delete the file when empty). */
    rewrite(entries) {
        try {
            if (entries.length === 0) {
                if (fs_1.default.existsSync(this.filePath))
                    fs_1.default.unlinkSync(this.filePath);
                return;
            }
            fs_1.default.mkdirSync(path_1.default.dirname(this.filePath), { recursive: true });
            fs_1.default.writeFileSync(this.filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
        }
        catch (err) {
            process.stderr.write(`[pinta-cc] retry-queue rewrite failed: ${err}\n`);
        }
    }
    /**
     * Try to acquire the lock for ~LOCK_TIMEOUT_MS. Returns true on success.
     * Caller MUST call `release()` if true is returned.
     */
    tryAcquireLock() {
        const start = Date.now();
        fs_1.default.mkdirSync(path_1.default.dirname(this.lockPath), { recursive: true });
        while (Date.now() - start < LOCK_TIMEOUT_MS) {
            try {
                const fd = fs_1.default.openSync(this.lockPath, "wx");
                fs_1.default.writeSync(fd, String(process.pid));
                fs_1.default.closeSync(fd);
                return true;
            }
            catch (err) {
                if (err?.code !== "EEXIST") {
                    process.stderr.write(`[pinta-cc] retry-queue lock open failed: ${err}\n`);
                    return false;
                }
                // Stale lock detection: if mtime is older than 30s, drop it.
                try {
                    const st = fs_1.default.statSync(this.lockPath);
                    if (Date.now() - st.mtimeMs > 30_000) {
                        fs_1.default.unlinkSync(this.lockPath);
                        continue;
                    }
                }
                catch {
                    /* ignore */
                }
                const wait = LOCK_POLL_MS;
                const end = Date.now() + wait;
                while (Date.now() < end) {
                    /* spin briefly; sync only because hooks are short-lived */
                }
            }
        }
        return false;
    }
    release() {
        try {
            fs_1.default.unlinkSync(this.lockPath);
        }
        catch {
            /* already gone */
        }
    }
    trim() {
        const entries = this.readAll();
        if (entries.length <= MAX_ENTRIES)
            return;
        const drop = entries.length - MAX_ENTRIES;
        process.stderr.write(`[pinta-cc] retry-queue full, dropping ${drop} oldest entries\n`);
        this.rewrite(entries.slice(drop));
    }
}
exports.RetryQueue = RetryQueue;
//# sourceMappingURL=retry-queue.js.map