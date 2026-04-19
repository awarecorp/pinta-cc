export interface PintaConfig {
    endpoint: string;
    apiKey: string;
    pluginRoot: string;
    pluginData: string;
    rulesPath: string;
    healthPath: string;
    tracePath: string;
}
export declare function loadConfig(): PintaConfig;
