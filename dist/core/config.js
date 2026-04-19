"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const path_1 = __importDefault(require("path"));
function loadConfig() {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    const pluginData = process.env.CLAUDE_PLUGIN_DATA || path_1.default.join(pluginRoot, ".plugin-data");
    const endpoint = process.env.CLAUDE_PLUGIN_OPTION_ENDPOINT;
    const apiKey = process.env.CLAUDE_PLUGIN_OPTION_API_KEY;
    if (!endpoint)
        throw new Error("endpoint is not configured");
    if (!apiKey)
        throw new Error("api_key is not configured");
    return {
        endpoint: endpoint.replace(/\/+$/, ""),
        apiKey,
        pluginRoot,
        pluginData,
        rulesPath: path_1.default.join(pluginData, "rules.json"),
        healthPath: path_1.default.join(pluginData, "health.json"),
        tracePath: path_1.default.join(pluginData, "trace.json"),
    };
}
//# sourceMappingURL=config.js.map