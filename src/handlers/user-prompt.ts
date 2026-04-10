import crypto from "crypto";
import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { TraceManager } from "../core/trace.js";

export async function handleUserPrompt(event: UserPromptSubmitEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  const trace = new TraceManager(config);
  const traceId = trace.newTrace();
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
