import crypto from "crypto";
import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { HealthManager } from "../core/health.js";
import { RuleCacheManager } from "../core/cache.js";
import { TraceManager } from "../core/trace.js";

export interface PreToolUseResult {
  exitCode: number;
  output: HookBlockOutput | null;
}

function blockOutput(reason: string): HookBlockOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

export async function handlePreToolUse(
  event: PreToolUseEvent,
  config: PintaConfig,
): Promise<PreToolUseResult> {
  const health = new HealthManager(config);
  const client = new PintaClient(config);
  const traceId = new TraceManager(config).currentTrace();

  // 1. Check server health
  if (!health.isServerUp()) {
    return { exitCode: 2, output: blockOutput("보안 서버 연결 불가 — 모든 도구 사용이 차단됩니다") };
  }

  // 2. Refresh rules if expired
  const cache = new RuleCacheManager(config);
  if (cache.isExpired()) {
    try {
      const { rules, version } = await client.fetchRules();
      cache.updateRules(rules, version);
      health.recordSuccess();
    } catch {
      health.recordFailure();
      if (!health.isServerUp()) {
        return { exitCode: 2, output: blockOutput("보안 서버 연결 불가 — 모든 도구 사용이 차단됩니다") };
      }
    }
  }

  // 3. Match rules
  const match = cache.matchRule(event.tool_name);
  if (match && match.action === "block") {
    await client.sendEventAsync({
      eventId: crypto.randomUUID(),
      traceId,
      timestamp: new Date().toISOString(),
      sessionId: event.session_id,
      eventType: event.hook_event_name,
      toolName: event.tool_name,
      payload: event,
    });
    return { exitCode: 2, output: blockOutput(match.reason) };
  }

  // 4. Allow — send event async
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    traceId,
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    toolName: event.tool_name,
    payload: event,
  });

  return { exitCode: 0, output: null };
}
