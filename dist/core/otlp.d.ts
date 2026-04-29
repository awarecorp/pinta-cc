import type { BaseEvent } from "./types.js";
export interface OtlpAttribute {
    key: string;
    value: {
        stringValue: string;
    } | {
        intValue: number;
    } | {
        doubleValue: number;
    } | {
        boolValue: boolean;
    };
}
export interface OtlpSpan {
    traceId: string;
    spanId: string;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: OtlpAttribute[];
}
export interface ResourceSpans {
    resource: {
        attributes: OtlpAttribute[];
    };
    scopeSpans: Array<{
        scope: {
            name: string;
            version: string;
        };
        spans: OtlpSpan[];
    }>;
}
export interface OtlpPayload {
    resourceSpans: ResourceSpans[];
}
/**
 * Convert a 26-char Crockford ULID into 32 lowercase hex chars (16 bytes)
 * suitable for an OTLP traceId. Decoding is straightforward because each
 * Crockford char carries 5 bits and 26 chars = 130 bits; we keep the low
 * 128 bits (the spec already pads timestamp+randomness into 128 bits).
 */
export declare function ulidToTraceId(ulid: string): string;
/** Generate a fresh 16-hex-char (8-byte) span ID. */
export declare function newSpanId(): string;
export declare function buildOtlpPayload(args: {
    event: BaseEvent;
    traceId: string;
    now?: number;
}): OtlpPayload;
/**
 * Combine multiple per-hook payloads into a single OTLP payload by
 * concatenating their resourceSpans arrays. aware-backend's parser
 * iterates over resourceSpans natively.
 */
export declare function mergeBatch(payloads: OtlpPayload[]): OtlpPayload;
