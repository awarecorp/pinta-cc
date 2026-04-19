import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
import type { GuardClient, GuardResponse } from "../core/guard.js";
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

function guardDenyReason(response: GuardResponse): string {
  const denySpan = response.spans.find((s) => s.decision === "DENY");
  const ev = denySpan?.evidences[0];
  if (!ev) return "Blocked by Pinta guard policy.";
  return `Blocked by Pinta guard: ${ev.detectionRule} (${ev.category}/${ev.severity}).`;
}

export async function handlePreToolUse(
  event: PreToolUseEvent,
  config: PintaConfig,
  identityResolver: IdentityResolver,
  guardClient: GuardClient,
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

  const [guardResponse] = await Promise.all([
    guardClient.evaluate(payload),
    transport.send(payload),
  ]);

  if (guardResponse && guardResponse.decision === "DENY") {
    return { exitCode: 2, output: blockOutput(guardDenyReason(guardResponse)) };
  }

  return { exitCode: 0, output: null };
}
