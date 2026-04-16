import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
import { PintaClient, buildEvent } from "../core/client.js";
import { TraceManager } from "../core/trace.js";

export async function handleUserPrompt(event: UserPromptSubmitEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  const traceId = new TraceManager(config).newTrace();
  await client.sendEventAsync(buildEvent(event, traceId));
  return 0;
}
