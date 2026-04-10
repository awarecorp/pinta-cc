import crypto from "crypto";
import type { PintaConfig } from "../core/config.js";
import type { PostToolUseEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { TraceManager } from "../core/trace.js";

export async function handlePostToolUse(event: PostToolUseEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  const traceId = new TraceManager(config).currentTrace();
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    traceId,
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    toolName: event.tool_name,
    payload: event,
  });
  return 0;
}
