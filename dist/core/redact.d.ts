export interface RedactOptions {
    /**
     * Optional context hint that enables context-gated patterns. Currently
     * only "bash" enables `cli_password_short` (-p<pass>) since matching it
     * outside Bash command text is too noisy.
     */
    context?: "bash";
}
/** Tier 3 cap: per-string byte limit before truncation. */
export declare const MAX_BYTES = 102400;
/**
 * Truncate input by UTF-8 byte length. Appends `…[TRUNCATED:<origByteLen>]`
 * to indicate elision. Returns input unchanged when within cap.
 *
 * Uses Buffer for accurate byte counting; slices on byte boundary then
 * decodes — may produce a U+FFFD if the boundary lands mid-codepoint, which
 * is acceptable for telemetry.
 */
export declare function truncate(input: string): string;
export interface Pattern {
    /** Token type printed inside `[REDACTED:<type>]`. */
    type: string;
    /** Regex with global flag (`g`). Multiline (`m`) for line-anchored ones. */
    regex: RegExp;
    /**
     * Capture group index whose substring is replaced. 0 (default) = whole match.
     * Use a positive group when the pattern brackets context that should be
     * preserved (e.g. `postgres://user:<pwd>@` keeps the URL shape intact).
     */
    captureGroup?: number;
    /**
     * If set, this pattern only applies when `RedactOptions.context` equals
     * the listed value. Used for false-positive-prone shapes.
     */
    requireContext?: "bash";
}
export declare const PATTERNS: ReadonlyArray<Pattern>;
interface Match {
    start: number;
    end: number;
    replaceStart: number;
    replaceEnd: number;
    type: string;
}
export declare function collectMatches(input: string, opts: RedactOptions): Match[];
export declare function resolveOverlaps(matches: Match[]): Match[];
export declare function applyMatches(input: string, matches: Match[]): string;
/**
 * Mask high-confidence secret patterns in `input`. Returns a new string with
 * matched substrings replaced by `[REDACTED:<type>]`.
 *
 * - `opts.context = "bash"` enables context-gated patterns.
 * - Truncation is NOT applied here — see `truncate()`. The caller decides
 *   the order (spec §3 Tier 3: truncate first, then redact).
 */
export declare function redact(input: string, opts?: RedactOptions): string;
export {};
