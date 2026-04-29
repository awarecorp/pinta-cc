"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.hasOtlpEndpoint = hasOtlpEndpoint;
const path_1 = __importDefault(require("path"));
function loadConfig() {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    const pluginData = process.env.CLAUDE_PLUGIN_DATA || path_1.default.join(pluginRoot, ".plugin-data");
    return {
        pluginRoot,
        pluginData,
        tracePath: path_1.default.join(pluginData, "trace.json"),
    };
}
/** Returns true if OTel endpoint is configured (signal to silently disable telemetry). */
function hasOtlpEndpoint() {
    return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}
//# sourceMappingURL=config.js.map