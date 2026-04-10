import crypto from "crypto";
import type { PintaConfig } from "../core/config.js";
import type { SessionEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { HealthManager } from "../core/health.js";
import { RuleCacheManager } from "../core/cache.js";
import { TraceManager } from "../core/trace.js";

export async function handleSession(event: SessionEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);

  if (event.hook_event_name === "SessionStart") {
    const health = new HealthManager(config);
    const isUp = await client.checkHealth();
    if (isUp) {
      health.recordSuccess();
    } else {
      health.recordFailure();
    }

    if (isUp) {
      try {
        const { rules, version } = await client.fetchRules();
        const cache = new RuleCacheManager(config);
        cache.updateRules(rules, version);
      } catch {
        // rule sync failure is non-fatal at session start
      }
    }
  }

  const traceId = new TraceManager(config).currentTrace();
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    traceId,
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    payload: event,
  });

  return 0;
}
