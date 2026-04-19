"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStop = handleStop;
const transport_js_1 = require("../core/transport.js");
const trace_js_1 = require("../core/trace.js");
const otlp_js_1 = require("../core/otlp.js");
const auth_message_js_1 = require("./auth-message.js");
async function handleStop(event, config, identityResolver) {
    const transport = new transport_js_1.Transport(config);
    await transport.flush();
    const identity = await identityResolver.resolve();
    if (!identity) {
        process.stderr.write((0, auth_message_js_1.authRequiredMessage)());
        return 1;
    }
    const traceId = new trace_js_1.TraceManager(config).currentTrace();
    const payload = (0, otlp_js_1.buildOtlpPayload)({ event, traceId, identity });
    await transport.send(payload);
    return 0;
}
//# sourceMappingURL=stop.js.map