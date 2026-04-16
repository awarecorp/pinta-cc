import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { PintaConfig } from "./config.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateUlid(): string {
  const now = Date.now();
  // 10 chars timestamp (48-bit ms)
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t & 31] + ts;
    t = Math.floor(t / 32);
  }
  // 16 chars randomness (80-bit)
  const rand = crypto.randomBytes(10);
  let r = "";
  for (let i = 0; i < 10; i++) {
    r += CROCKFORD[rand[i] & 31];
  }
  // pad to 16 chars
  while (r.length < 16) r += CROCKFORD[0];
  return ts + r;
}

export class TraceManager {
  private tracePath: string;

  constructor(config: PintaConfig) {
    this.tracePath = config.tracePath;
  }

  /** UserPromptSubmit 시 새 traceId 생성 및 저장 */
  newTrace(): string {
    const traceId = generateUlid();
    this.save(traceId);
    return traceId;
  }

  /** 현재 traceId 반환. 없으면 새로 생성 */
  currentTrace(): string {
    try {
      const data = fs.readFileSync(this.tracePath, "utf-8");
      const { traceId } = JSON.parse(data);
      if (traceId) return traceId;
    } catch {
      // no trace file yet
    }
    return this.newTrace();
  }

  private save(traceId: string): void {
    fs.mkdirSync(path.dirname(this.tracePath), { recursive: true });
    fs.writeFileSync(this.tracePath, JSON.stringify({ traceId }));
  }
}
