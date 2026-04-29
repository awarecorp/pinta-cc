import type { PintaConfig } from "../core/config.js";
import type { SubagentEvent } from "../core/types.js";
import { Transport } from "../core/transport.js";
import { TraceManager } from "../core/trace.js";
import { buildOtlpPayload } from "../core/otlp.js";

export async function handleSubagent(
  event: SubagentEvent,
  config: PintaConfig,
): Promise<number> {
  const transport = new Transport(config);
  await transport.flush();

  const traceId = new TraceManager(config).currentTrace();
  const payload = buildOtlpPayload({ event, traceId });
  await transport.send(payload);
  return 0;
}
