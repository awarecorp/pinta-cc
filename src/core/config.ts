import fs from "fs";
import path from "path";

export interface PintaConfig {
  endpoint: string;
  apiKey: string;
  pluginRoot: string;
  pluginData: string;
  rulesPath: string;
  healthPath: string;
}

function loadEnvFile(pluginRoot: string): { endpoint?: string; api_key?: string } {
  try {
    const envPath = path.join(pluginRoot, "env.json");
    const data = fs.readFileSync(envPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function loadConfig(): PintaConfig {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const pluginData = process.env.CLAUDE_PLUGIN_DATA || path.join(pluginRoot, ".plugin-data");
  const envFile = loadEnvFile(pluginRoot);

  const endpoint = process.env.CLAUDE_PLUGIN_OPTION_ENDPOINT || envFile.endpoint;
  const apiKey = process.env.CLAUDE_PLUGIN_OPTION_API_KEY || envFile.api_key;

  if (!endpoint) throw new Error("endpoint is not configured");
  if (!apiKey) throw new Error("api_key is not configured");

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    pluginRoot,
    pluginData,
    rulesPath: path.join(pluginData, "rules.json"),
    healthPath: path.join(pluginData, "health.json"),
  };
}
