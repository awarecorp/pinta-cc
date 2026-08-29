import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent } from "../core/types.js";
import { evaluateGuard } from "../core/guard.js";
import { emitEvent } from "./shared.js";

export async function handlePreToolUse(
  event: PreToolUseEvent,
  config: PintaConfig,
): Promise<number> {
  const rawToolInput =
    typeof event.tool_input === "string"
      ? event.tool_input
      : JSON.stringify(event.tool_input);
  // `cwd` and `hook_event_name` are on every hook payload and were being
  // dropped here. Both change what the guard can conclude:
  //
  // - `cwd` locates a relative target. `rm -rf passwd` reads as routine work
  //   until you know it was issued from /etc (PTA-176).
  // - `hook_event_name` is what lets the manager trust `tool_name`. Claude Code
  //   owns these names; an MCP server does not, so without the event a tool
  //   called `Read` is taken at its word and its arguments are treated as
  //   content rather than as a command (PTA-207).
  const guard = await evaluateGuard(
    {
      spanId: event.session_id ?? "unknown",
      toolName: event.tool_name,
      method: event.hook_event_name,
      cwd: event.cwd,
      toolInput: event.tool_input,
      rawTextFields: { toolInput: rawToolInput },
    },
    process.env.PINTA_GUARD_ENDPOINT,
  );

  // SECURITY: enforce the guard decision BEFORE telemetry. A DENY must be
  // written to stdout first so a later telemetry failure can never bubble to
  // runHook's fail-open catch and silently ALLOW a tool the guard blocked.
  if (guard?.decision === "DENY") {
    // Prefer manager-supplied userMessage (carries the "Blocked by Pinta AI"
    // brand text + rule). Fall back to raw rule name for older managers, and
    // to 'guard_deny' literal if even reason is missing.
    const reason = guard.userMessage ?? guard.reason ?? "guard_deny";
    const out = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny" as const,
        permissionDecisionReason: reason,
      },
    };
    process.stdout.write(JSON.stringify(out) + "\n");
  }

  // Telemetry is best-effort: its failure must never override the already
  // written security decision (or flip an ALLOW into a fail-open error path).
  try {
    await emitEvent(event, config, { guard });
  } catch (err) {
    process.stderr.write(`[pinta-cc] telemetry emit failed: ${err}\n`);
  }

  return 0;
}
