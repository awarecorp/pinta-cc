import type { OtlpPayload } from "./otlp.js";
export type GuardDecision = "ALLOW" | "DENY" | "REVIEW";
export interface GuardEvidenceSummary {
    category: string;
    severity: string;
    detectionRule: string;
    signal: {
        category: string;
        source: string;
        path: string;
    };
}
export interface GuardSpanResult {
    spanId: string;
    decision: GuardDecision;
    evidences: GuardEvidenceSummary[];
}
export interface GuardResponse {
    decision: GuardDecision;
    spans: GuardSpanResult[];
    traceStored: boolean;
}
export interface GuardClient {
    /**
     * Evaluate the payload synchronously. Returns null on transport failure
     * so handlers stay fail-open — only identity gates fail-close.
     */
    evaluate(payload: OtlpPayload): Promise<GuardResponse | null>;
}
export declare class NoOpGuardClient implements GuardClient {
    evaluate(): Promise<GuardResponse | null>;
}
