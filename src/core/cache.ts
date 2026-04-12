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

  matchRule(toolName: string, toolInput?: Record<string, unknown>): RuleMatchResult | null {
    for (const rule of this.cache.rules) {
      if (!this.matchesToolName(rule.toolName, toolName)) continue;
      if (rule.pattern) {
        const value = this.extractFieldValue(toolName, toolInput, rule.field);
        if (!value || !this.matchesPattern(rule.pattern, value)) continue;
      }
      return { action: rule.action, reason: rule.reason };
    }
    return null;
  }

  isExpired(): boolean {
    if (!this.cache.lastSynced) return true;
    const elapsed = Date.now() - new Date(this.cache.lastSynced).getTime();
    return elapsed > CACHE_TTL_MS;
  }

  private static DEFAULT_FIELDS: Record<string, string> = {
    Bash: "command",
    Read: "file_path",
    Write: "file_path",
    Edit: "file_path",
    Glob: "pattern",
    Grep: "pattern",
    WebFetch: "url",
    WebSearch: "query",
    Agent: "prompt",
  };

  private matchesToolName(ruleToolName: string, toolName: string): boolean {
    if (ruleToolName === "*") return true;
    return ruleToolName === toolName;
  }

  private extractFieldValue(
    toolName: string,
    toolInput?: Record<string, unknown>,
    fieldOverride?: string,
  ): string | null {
    if (!toolInput) return null;
    const field = fieldOverride ?? RuleCacheManager.DEFAULT_FIELDS[toolName];
    if (!field) return null;
    const value = toolInput[field];
    return typeof value === "string" ? value : null;
  }

  private matchesPattern(pattern: string, value: string): boolean {
    try {
      return new RegExp(pattern, "i").test(value);
    } catch {
      return false;
    }
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
