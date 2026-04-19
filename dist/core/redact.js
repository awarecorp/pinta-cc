"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATTERNS = exports.MAX_BYTES = void 0;
exports.truncate = truncate;
exports.collectMatches = collectMatches;
exports.resolveOverlaps = resolveOverlaps;
exports.applyMatches = applyMatches;
exports.redact = redact;
/** Tier 3 cap: per-string byte limit before truncation. */
exports.MAX_BYTES = 102400;
/**
 * Truncate input by UTF-8 byte length. Appends `…[TRUNCATED:<origByteLen>]`
 * to indicate elision. Returns input unchanged when within cap.
 *
 * Uses Buffer for accurate byte counting; slices on byte boundary then
 * decodes — may produce a U+FFFD if the boundary lands mid-codepoint, which
 * is acceptable for telemetry.
 */
function truncate(input) {
    const buf = Buffer.from(input, "utf-8");
    if (buf.length <= exports.MAX_BYTES)
        return input;
    const head = buf.subarray(0, exports.MAX_BYTES).toString("utf-8");
    return `${head}…[TRUNCATED:${buf.length}]`;
}
exports.PATTERNS = [
    { type: "aws_access_key", regex: /AKIA[0-9A-Z]{16}/g },
    {
        type: "aws_secret_key",
        // Context word `aws_secret`/`AWS_SECRET` (with optional separator) followed
        // by an assignment-ish character then a 40-char base64-ish blob.
        regex: /(?:aws[_-]?secret(?:[_-]?(?:access)?[_-]?key)?)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
        captureGroup: 1,
    },
    {
        type: "gcp_service_account",
        // Whole JSON blob starting with the service-account discriminator.
        regex: /\{[\s\S]{0,200}?"type"\s*:\s*"service_account"[\s\S]*?\}/g,
    },
    { type: "github_token", regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
    { type: "gitlab_token", regex: /glpat-[A-Za-z0-9_-]{20}/g },
    { type: "slack_token", regex: /xox[abrsp]-[0-9A-Za-z-]{10,}/g },
    { type: "openai_key", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g },
    { type: "anthropic_key", regex: /sk-ant-[A-Za-z0-9_-]{50,}/g },
    { type: "stripe_key", regex: /(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{20,}/g },
    {
        type: "jwt",
        regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    },
    {
        type: "private_key_block",
        regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    },
    { type: "bearer_token", regex: /bearer\s+([A-Za-z0-9._~+/=-]{12,})/gi, captureGroup: 1 },
    { type: "basic_auth", regex: /basic\s+([A-Za-z0-9+/=]{12,})/gi, captureGroup: 1 },
    {
        type: "db_url_password",
        regex: /\b(?:postgres|postgresql|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:([^@\s]+)@/gi,
        captureGroup: 1,
    },
    {
        type: "cli_password_flag",
        regex: /(?:--password|--pass|--pwd)[=\s]([^\s'"]+)/g,
        captureGroup: 1,
    },
    {
        type: "cli_password_short",
        // mysql -p<pass>; only on bash context.
        regex: /\s-p([^\s'"]+)/g,
        captureGroup: 1,
        requireContext: "bash",
    },
    {
        type: "env_var_secret",
        // Known false positive: trailing `[A-Z0-9_]*` is greedy, so names like
        // `OPENAI_API_KEY_DESCRIPTION=Used` still match. Acceptable for Bronze.
        regex: /^(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_KEY)[A-Z0-9_]*)\s*=\s*["']?([^\s"'\n]+)/gm,
        captureGroup: 2,
    },
];
function collectMatches(input, opts) {
    const out = [];
    for (const pattern of exports.PATTERNS) {
        if (pattern.requireContext && pattern.requireContext !== opts.context)
            continue;
        const re = new RegExp(pattern.regex.source, pattern.regex.flags);
        let m;
        while ((m = re.exec(input)) !== null) {
            const cg = pattern.captureGroup ?? 0;
            const captured = m[cg];
            if (captured === undefined) {
                if (m.index === re.lastIndex)
                    re.lastIndex++;
                continue;
            }
            const start = m.index;
            const end = m.index + m[0].length;
            const replaceStart = start + m[0].indexOf(captured);
            const replaceEnd = replaceStart + captured.length;
            out.push({ start, end, replaceStart, replaceEnd, type: pattern.type });
            if (m.index === re.lastIndex)
                re.lastIndex++; // guard against zero-length
        }
    }
    return out;
}
function resolveOverlaps(matches) {
    const sorted = [...matches].sort((a, b) => {
        if (a.start !== b.start)
            return a.start - b.start;
        return (b.end - b.start) - (a.end - a.start); // longer whole-match wins on tie
    });
    const kept = [];
    let lastEnd = -1;
    for (const m of sorted) {
        if (m.start < lastEnd)
            continue; // overlapping later match dropped
        kept.push(m);
        lastEnd = m.end;
    }
    return kept;
}
function applyMatches(input, matches) {
    // Apply right-to-left so earlier indices remain valid.
    const sorted = [...matches].sort((a, b) => b.replaceStart - a.replaceStart);
    let out = input;
    for (const m of sorted) {
        out = out.slice(0, m.replaceStart) + `[REDACTED:${m.type}]` + out.slice(m.replaceEnd);
    }
    return out;
}
/**
 * Mask high-confidence secret patterns in `input`. Returns a new string with
 * matched substrings replaced by `[REDACTED:<type>]`.
 *
 * - `opts.context = "bash"` enables context-gated patterns.
 * - Truncation is NOT applied here — see `truncate()`. The caller decides
 *   the order (spec §3 Tier 3: truncate first, then redact).
 */
function redact(input, opts = {}) {
    if (input.length === 0)
        return input;
    const all = collectMatches(input, opts);
    if (all.length === 0)
        return input;
    const kept = resolveOverlaps(all);
    return applyMatches(input, kept);
}
//# sourceMappingURL=redact.js.map