import type { PintaConfig } from "../core/config.js";
import type { GuardClient, GuardResponse } from "../core/guard.js";
import type { OtlpPayload } from "../core/otlp.js";
export declare class PintaGuardClient implements GuardClient {
    private config;
    constructor(config: PintaConfig);
    evaluate(payload: OtlpPayload): Promise<GuardResponse | null>;
}
