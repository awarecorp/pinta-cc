"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePreToolUse = handlePreToolUse;
const transport_js_1 = require("../core/transport.js");
const trace_js_1 = require("../core/trace.js");
const otlp_js_1 = require("../core/otlp.js");
async function handlePreToolUse(event, config) {
    const transport = new transport_js_1.Transport(config);
    await transport.flush();
    const traceId = new trace_js_1.TraceManager(config).currentTrace();
    const payload = (0, otlp_js_1.buildOtlpPayload)({ event, traceId });
    await transport.send(payload);
    return 0;
}
//# sourceMappingURL=pre-tool-use.js.map