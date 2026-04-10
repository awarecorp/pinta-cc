import { loadConfig } from "./core/config.js";
import { isPreToolUseEvent, isPostToolUseEvent, isUserPromptSubmitEvent, isSessionEvent } from "./core/types.js";
import type { BaseEvent } from "./core/types.js";
import { handlePreToolUse } from "./handlers/pre-tool-use.js";
import { handlePostToolUse } from "./handlers/post-tool-use.js";
import { handleUserPrompt } from "./handlers/user-prompt.js";
import { handleSession } from "./handlers/session.js";
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

  try {
    const config = loadConfig();
    const raw = await readStdin();
    const event: BaseEvent = JSON.parse(raw);

    if (isPreToolUseEvent(event)) {
      const result = await handlePreToolUse(event, config);
      exitCode = result.exitCode;
      if (result.output) {
        process.stdout.write(JSON.stringify(result.output));
      }
    } else if (isPostToolUseEvent(event)) {
      exitCode = await handlePostToolUse(event, config);
    } else if (isUserPromptSubmitEvent(event)) {
      exitCode = await handleUserPrompt(event, config);
    } else if (isSessionEvent(event)) {
      exitCode = await handleSession(event, config);
    } else {
      exitCode = await handleDefault(event, config);
    }
  } catch (err) {
    process.stderr.write(`[pinta] error: ${err}\n`);
    exitCode = 0;
  }

  process.exit(exitCode);
}

main();
