/**
 * Plugin config — ONLY the bits we actually use after v1.2.
 * Endpoint/headers come from OTEL_EXPORTER_OTLP_* env vars (set by
 * env-bridge.ts at process startup) — they are NOT in this struct.
 */
export interface PintaConfig {
    pluginRoot: string;
    pluginData: string;
    tracePath: string;
}
export declare function loadConfig(): PintaConfig;
/** Returns true if OTel endpoint is configured (signal to silently disable telemetry). */
export declare function hasOtlpEndpoint(): boolean;
