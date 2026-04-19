import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
import { Transport } from "../core/transport.js";
import { TraceManager } from "../core/trace.js";
import { buildOtlpPayload } from "../core/otlp.js";
import { authRequiredMessage } from "./auth-message.js";

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
  identityResolver: IdentityResolver,
): Promise<PreToolUseResult> {
  const transport = new Transport(config);
  await transport.flush();

  const identity = await identityResolver.resolve();
  if (!identity) {
    process.stderr.write(authRequiredMessage());
    return { exitCode: 2, output: blockOutput(authRequiredMessage()) };
  }

  const traceId = new TraceManager(config).currentTrace();
  const payload = buildOtlpPayload({ event, traceId, identity });
  await transport.send(payload);
  return { exitCode: 0, output: null };
}
