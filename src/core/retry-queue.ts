import fs from "fs";
import path from "path";
import type { OtlpPayload } from "./otlp.js";

const MAX_ENTRIES = 1000;
const LOCK_TIMEOUT_MS = 50;
const LOCK_POLL_MS = 5;

export interface QueueEntry {
  savedAt: string; // ISO-8601
  payload: OtlpPayload;
}

export class RetryQueue {
  private filePath: string;
  private lockPath: string;

  constructor(pluginData: string) {
    this.filePath = path.join(pluginData, "failed-spans.jsonl");
    this.lockPath = this.filePath + ".lock";
  }

  /** Append a single payload. Best-effort: any IO error is swallowed (logged to stderr). */
  enqueue(payload: OtlpPayload): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const line = JSON.stringify({ savedAt: new Date().toISOString(), payload }) + "\n";
      fs.appendFileSync(this.filePath, line);
      this.trim();
    } catch (err) {
      process.stderr.write(`[pinta-cc] retry-queue enqueue failed: ${err}\n`);
    }
  }

  /**
   * Read all entries oldest-first. Returns [] if the file does not exist or is unreadable.
   * Does NOT delete the file — callers handle persistence via `rewrite`.
   */
  readAll(): QueueEntry[] {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const out: QueueEntry[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          // skip malformed line
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Replace the queue with the given entries (or delete the file when empty). */
  rewrite(entries: QueueEntry[]): void {
    try {
      if (entries.length === 0) {
        if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
        return;
      }
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    } catch (err) {
      process.stderr.write(`[pinta-cc] retry-queue rewrite failed: ${err}\n`);
    }
  }

  /**
   * Try to acquire the lock for ~LOCK_TIMEOUT_MS. Returns true on success.
   * Caller MUST call `release()` if true is returned.
   */
  tryAcquireLock(): boolean {
    const start = Date.now();
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    while (Date.now() - start < LOCK_TIMEOUT_MS) {
      try {
        const fd = fs.openSync(this.lockPath, "wx");
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
        return true;
      } catch (err: any) {
        if (err?.code !== "EEXIST") {
          process.stderr.write(`[pinta-cc] retry-queue lock open failed: ${err}\n`);
          return false;
        }
        // Stale lock detection: if mtime is older than 30s, drop it.
        try {
          const st = fs.statSync(this.lockPath);
          if (Date.now() - st.mtimeMs > 30_000) {
            fs.unlinkSync(this.lockPath);
            continue;
          }
        } catch {
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

  release(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {
      /* already gone */
    }
  }

  private trim(): void {
    const entries = this.readAll();
    if (entries.length <= MAX_ENTRIES) return;
    const drop = entries.length - MAX_ENTRIES;
    process.stderr.write(`[pinta-cc] retry-queue full, dropping ${drop} oldest entries\n`);
    this.rewrite(entries.slice(drop));
  }
}
