import path from "path";

export interface PintaConfig {
  endpoint: string;
  apiKey: string;
  pluginRoot: string;
  pluginData: string;
  rulesPath: string;
  healthPath: string;
  tracePath: string;
}

export function loadConfig(): PintaConfig {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const pluginData = process.env.CLAUDE_PLUGIN_DATA || path.join(pluginRoot, ".plugin-data");

  const endpoint = process.env.CLAUDE_PLUGIN_OPTION_ENDPOINT;
  const apiKey = process.env.CLAUDE_PLUGIN_OPTION_API_KEY;

  if (!endpoint) throw new Error("endpoint is not configured");
  if (!apiKey) throw new Error("api_key is not configured");

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    pluginRoot,
    pluginData,
    rulesPath: path.join(pluginData, "rules.json"),
    healthPath: path.join(pluginData, "health.json"),
    tracePath: path.join(pluginData, "trace.json"),
  };
}
