import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
import { Transport } from "../core/transport.js";
import { TraceManager } from "../core/trace.js";
import { buildOtlpPayload } from "../core/otlp.js";

export async function handleUserPrompt(
  event: UserPromptSubmitEvent,
  config: PintaConfig,
): Promise<number> {
  const transport = new Transport(config);
  await transport.flush();

  const traceId = new TraceManager(config).newTrace(); // NEW trace per user turn
  const payload = buildOtlpPayload({ event, traceId });
  await transport.send(payload);
  return 0;
}
