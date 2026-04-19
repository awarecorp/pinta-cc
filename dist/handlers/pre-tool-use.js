"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePreToolUse = handlePreToolUse;
const transport_js_1 = require("../core/transport.js");
const trace_js_1 = require("../core/trace.js");
const otlp_js_1 = require("../core/otlp.js");
const auth_message_js_1 = require("./auth-message.js");
function blockOutput(reason) {
    return {
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
        },
    };
}
function guardDenyReason(response) {
    const denySpan = response.spans.find((s) => s.decision === "DENY");
    const ev = denySpan?.evidences[0];
    if (!ev)
        return "Blocked by Pinta guard policy.";
    return `Blocked by Pinta guard: ${ev.detectionRule} (${ev.category}/${ev.severity}).`;
}
async function handlePreToolUse(event, config, identityResolver, guardClient) {
    const transport = new transport_js_1.Transport(config);
    await transport.flush();
    const identity = await identityResolver.resolve();
    if (!identity) {
        process.stderr.write((0, auth_message_js_1.authRequiredMessage)());
        return { exitCode: 2, output: blockOutput((0, auth_message_js_1.authRequiredMessage)()) };
    }
    const traceId = new trace_js_1.TraceManager(config).currentTrace();
    const payload = (0, otlp_js_1.buildOtlpPayload)({ event, traceId, identity });
    const [guardResponse] = await Promise.all([
        guardClient.evaluate(payload),
        transport.send(payload),
    ]);
    if (guardResponse && guardResponse.decision === "DENY") {
        return { exitCode: 2, output: blockOutput(guardDenyReason(guardResponse)) };
    }
    return { exitCode: 0, output: null };
}
//# sourceMappingURL=pre-tool-use.js.map