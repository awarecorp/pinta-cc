import { loadConfig } from "./core/config.js";
import {
  isPreToolUseEvent,
  isPostToolUseEvent,
  isUserPromptSubmitEvent,
  isSessionEvent,
  isSubagentEvent,
  isStopEvent,
  isPermissionEvent,
  isSkippedHook,
} from "./core/types.js";
import type { BaseEvent } from "./core/types.js";
import type { IdentityResolver } from "./core/identity.js";
import type { GuardClient } from "./core/guard.js";
import { PintaIdentityResolver } from "./enterprise/pinta-identity.js";
import { PintaGuardClient } from "./enterprise/pinta-guard.js";
import { handlePreToolUse } from "./handlers/pre-tool-use.js";
import { handlePostToolUse } from "./handlers/post-tool-use.js";
import { handleUserPrompt } from "./handlers/user-prompt.js";
import { handleSession } from "./handlers/session.js";
import { handleSubagent } from "./handlers/subagent.js";
import { handleStop } from "./handlers/stop.js";
import { handlePermission } from "./handlers/permission.js";
import { handleDefault } from "./handlers/default.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  let exitCode = 0;

  // The DI seam: this is the ONLY place we instantiate enterprise impls.
  // Future OSS extraction swaps these for NoOp* variants.
  const identityResolver: IdentityResolver = new PintaIdentityResolver();

  try {
    const config = loadConfig();
    const guardClient: GuardClient = new PintaGuardClient(config);
    const raw = await readStdin();
    const event: BaseEvent = JSON.parse(raw);

    if (isSkippedHook(event)) {
      exitCode = await handleDefault(event);
    } else if (isPreToolUseEvent(event)) {
      const result = await handlePreToolUse(event, config, identityResolver, guardClient);
      exitCode = result.exitCode;
      if (result.output) {
        process.stdout.write(JSON.stringify(result.output));
      }
    } else if (isPostToolUseEvent(event)) {
      exitCode = await handlePostToolUse(event, config, identityResolver);
    } else if (isUserPromptSubmitEvent(event)) {
      exitCode = await handleUserPrompt(event, config, identityResolver);
    } else if (isSessionEvent(event)) {
      exitCode = await handleSession(event, config, identityResolver);
    } else if (isSubagentEvent(event)) {
      exitCode = await handleSubagent(event, config, identityResolver);
    } else if (isStopEvent(event)) {
      exitCode = await handleStop(event, config, identityResolver);
    } else if (isPermissionEvent(event)) {
      exitCode = await handlePermission(event, config, identityResolver);
    } else {
      exitCode = await handleDefault(event);
    }
  } catch (err) {
    process.stderr.write(`[pinta-cc] error: ${err}\n`);
    exitCode = 0; // top-level catch-all stays fail-open per spec §6
  }

  process.exit(exitCode);
}

main();
