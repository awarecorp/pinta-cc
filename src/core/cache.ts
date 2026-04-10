import fs from "fs";
import path from "path";
import type { PintaConfig } from "./config.js";
import type { Rule, RuleCache } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface RuleMatchResult {
  action: "block" | "allow";
  reason: string;
}

export class RuleCacheManager {
  private cache: RuleCache;
  private rulesPath: string;

  constructor(config: PintaConfig) {
    this.rulesPath = config.rulesPath;
    this.cache = this.load();
  }

  getRules(): Rule[] {
    return this.cache.rules;
  }

  updateRules(rules: Rule[], version: string): void {
    this.cache = {
      rules,
      lastSynced: new Date().toISOString(),
      serverVersion: version,
    };
    this.save();
  }

  matchRule(toolName: string): RuleMatchResult | null {
    for (const rule of this.cache.rules) {
      if (this.matchesToolName(rule.toolName, toolName)) {
        return { action: rule.action, reason: rule.reason };
      }
    }
    return null;
  }

  isExpired(): boolean {
    if (!this.cache.lastSynced) return true;
    const elapsed = Date.now() - new Date(this.cache.lastSynced).getTime();
    return elapsed > CACHE_TTL_MS;
  }

  private matchesToolName(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    return pattern === toolName;
  }

  private load(): RuleCache {
    try {
      const data = fs.readFileSync(this.rulesPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { rules: [], lastSynced: "", serverVersion: "" };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.rulesPath), { recursive: true });
    fs.writeFileSync(this.rulesPath, JSON.stringify(this.cache, null, 2));
  }
}
