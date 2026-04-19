"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_js_1 = require("./core/config.js");
const types_js_1 = require("./core/types.js");
const pinta_identity_js_1 = require("./enterprise/pinta-identity.js");
const pre_tool_use_js_1 = require("./handlers/pre-tool-use.js");
const post_tool_use_js_1 = require("./handlers/post-tool-use.js");
const user_prompt_js_1 = require("./handlers/user-prompt.js");
const session_js_1 = require("./handlers/session.js");
const subagent_js_1 = require("./handlers/subagent.js");
const stop_js_1 = require("./handlers/stop.js");
const permission_js_1 = require("./handlers/permission.js");
const default_js_1 = require("./handlers/default.js");
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
}
async function main() {
    let exitCode = 0;
    // The DI seam: this is the ONLY place we instantiate an enterprise resolver.
    // Future OSS extraction swaps this line for `NoOpIdentityResolver`.
    const identityResolver = new pinta_identity_js_1.PintaIdentityResolver();
    try {
        const config = (0, config_js_1.loadConfig)();
        const raw = await readStdin();
        const event = JSON.parse(raw);
        if ((0, types_js_1.isSkippedHook)(event)) {
            exitCode = await (0, default_js_1.handleDefault)(event);
        }
        else if ((0, types_js_1.isPreToolUseEvent)(event)) {
            const result = await (0, pre_tool_use_js_1.handlePreToolUse)(event, config, identityResolver);
            exitCode = result.exitCode;
            if (result.output) {
                process.stdout.write(JSON.stringify(result.output));
            }
        }
        else if ((0, types_js_1.isPostToolUseEvent)(event)) {
            exitCode = await (0, post_tool_use_js_1.handlePostToolUse)(event, config, identityResolver);
        }
        else if ((0, types_js_1.isUserPromptSubmitEvent)(event)) {
            exitCode = await (0, user_prompt_js_1.handleUserPrompt)(event, config, identityResolver);
        }
        else if ((0, types_js_1.isSessionEvent)(event)) {
            exitCode = await (0, session_js_1.handleSession)(event, config, identityResolver);
        }
        else if ((0, types_js_1.isSubagentEvent)(event)) {
            exitCode = await (0, subagent_js_1.handleSubagent)(event, config, identityResolver);
        }
        else if ((0, types_js_1.isStopEvent)(event)) {
            exitCode = await (0, stop_js_1.handleStop)(event, config, identityResolver);
        }
        else if ((0, types_js_1.isPermissionEvent)(event)) {
            exitCode = await (0, permission_js_1.handlePermission)(event, config, identityResolver);
        }
        else {
            exitCode = await (0, default_js_1.handleDefault)(event);
        }
    }
    catch (err) {
        process.stderr.write(`[pinta-cc] error: ${err}\n`);
        exitCode = 0; // top-level catch-all stays fail-open per spec §6
    }
    process.exit(exitCode);
}
main();
//# sourceMappingURL=index.js.map