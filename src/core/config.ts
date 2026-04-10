import fs from "fs";
import path from "path";

export interface PintaConfig {
  serverUrl: string;
  authToken: string;
  pluginRoot: string;
  pluginData: string;
  rulesPath: string;
  healthPath: string;
}

function loadEnvFile(pluginRoot: string): { server_url?: string; auth_token?: string } {
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

  const serverUrl = process.env.CLAUDE_PLUGIN_OPTION_SERVER_URL || envFile.server_url;
  const authToken = process.env.CLAUDE_PLUGIN_OPTION_AUTH_TOKEN || envFile.auth_token;

  if (!serverUrl) throw new Error("server_url is not configured");
  if (!authToken) throw new Error("auth_token is not configured");

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    authToken,
    pluginRoot,
    pluginData,
    rulesPath: path.join(pluginData, "rules.json"),
    healthPath: path.join(pluginData, "health.json"),
  };
}
