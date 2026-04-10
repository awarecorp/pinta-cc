import fs from "fs";
import path from "path";
import type { PintaConfig } from "./config.js";
import type { HealthState } from "./types.js";

const MAX_CONSECUTIVE_FAILURES = 3;

export class HealthManager {
  private state: HealthState;
  private healthPath: string;

  constructor(config: PintaConfig) {
    this.healthPath = config.healthPath;
    this.state = this.load();
  }

  isServerUp(): boolean {
    return this.state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
  }

  getState(): HealthState {
    return { ...this.state };
  }

  recordSuccess(): void {
    this.state = {
      serverUp: true,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: 0,
    };
    this.save();
  }

  recordFailure(): void {
    this.state.consecutiveFailures += 1;
    this.state.lastChecked = new Date().toISOString();
    this.state.serverUp = this.state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
    this.save();
  }

  private load(): HealthState {
    try {
      const data = fs.readFileSync(this.healthPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { serverUp: true, lastChecked: "", consecutiveFailures: 0 };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.healthPath), { recursive: true });
    fs.writeFileSync(this.healthPath, JSON.stringify(this.state, null, 2));
  }
}
