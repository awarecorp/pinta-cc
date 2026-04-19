import { strict as assert } from "node:assert";
import {
  truncate,
  redact,
  MAX_BYTES,
  PATTERNS,
  collectMatches,
  resolveOverlaps,
  applyMatches,
} from "../src/core/redact.js";

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    process.stdout.write(`  ok  ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  FAIL ${name}\n    ${err instanceof Error ? err.message : err}\n`);
  }
}

// --- truncate ---
check("truncate: short input passes through", () => {
  assert.equal(truncate("hello"), "hello");
});

check("truncate: long input is cut and tagged", () => {
  const input = "a".repeat(MAX_BYTES + 100);
  const out = truncate(input);
  assert.equal(out.startsWith("a".repeat(MAX_BYTES)), true);
  const headBytes = Buffer.from(out.split("…[TRUNCATED:")[0], "utf-8").length;
  assert.equal(headBytes, MAX_BYTES, `head should be exactly MAX_BYTES, got ${headBytes}`);
  assert.match(out, new RegExp(`…\\[TRUNCATED:${MAX_BYTES + 100}\\]$`));
});

check("truncate: input exactly at cap passes through", () => {
  const input = "a".repeat(MAX_BYTES);
  assert.equal(truncate(input), input);
});

check("truncate: counts bytes not codepoints (multibyte char)", () => {
  // "한" is 3 bytes UTF-8. With a tiny synthetic cap we can't override MAX_BYTES,
  // so verify the byte-aware byte count by ensuring a 100KB+ multibyte string
  // is truncated and the original byte length appears in the tag.
  const oneChar = "한"; // 3 bytes
  const charsToExceed = Math.ceil(MAX_BYTES / 3) + 10;
  const input = oneChar.repeat(charsToExceed);
  const origBytes = Buffer.from(input, "utf-8").length;
  const out = truncate(input);
  const headBytes = Buffer.from(out.split("…[TRUNCATED:")[0], "utf-8").length;
  // After slicing on a byte boundary, toString("utf-8") replaces any partial
  // codepoint at the tail with U+FFFD (3 bytes), so headBytes may be up to
  // MAX_BYTES + 2 when the boundary lands mid-codepoint. Allow for that.
  assert.ok(headBytes <= MAX_BYTES + 2, `head exceeds MAX_BYTES+2: ${headBytes}`);
  assert.match(out, new RegExp(`…\\[TRUNCATED:${origBytes}\\]$`));
});

interface PatternCase {
  type: string;
  input: string;
  /** Substring(s) the *output* must contain. */
  expectContains: string[];
  /** Substring(s) the *output* must NOT contain (typically the original secret). */
  expectMissing?: string[];
  context?: "bash";
}

function applySinglePattern(input: string, type: string): string {
  // Direct application of a single pattern's matches via the same algorithm
  // redact() will use. We re-run regex here without the full pipeline so a
  // pattern test fails when the regex is wrong, not when resolution is wrong.
  const pattern = PATTERNS.find((x) => x.type === type);
  if (!pattern) throw new Error(`no PATTERN with type=${type}`);
  const re = new RegExp(pattern.regex.source, pattern.regex.flags);
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const cg = pattern.captureGroup ?? 0;
    const captured = m[cg];
    if (captured === undefined) continue;
    const captureStart = m.index + m[0].indexOf(captured);
    const captureEnd = captureStart + captured.length;
    out += input.slice(last, captureStart) + `[REDACTED:${pattern.type}]`;
    last = captureEnd;
    if (m.index === re.lastIndex) re.lastIndex++; // zero-length guard
  }
  out += input.slice(last);
  return out;
}

const PATTERN_CASES: PatternCase[] = [
  {
    type: "aws_access_key",
    input: "key=AKIAIOSFODNN7EXAMPLE end",
    expectContains: ["[REDACTED:aws_access_key]"],
    expectMissing: ["AKIAIOSFODNN7EXAMPLE"],
  },
  {
    type: "aws_secret_key",
    input: "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expectContains: ["[REDACTED:aws_secret_key]"],
    expectMissing: ["wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
  },
  {
    type: "gcp_service_account",
    input: '{"type":"service_account","project_id":"foo","private_key":"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----"}',
    expectContains: ["[REDACTED:gcp_service_account]"],
    expectMissing: ['"project_id":"foo"', "BEGIN PRIVATE KEY"],
  },
  {
    type: "github_token",
    input: "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB end",
    expectContains: ["[REDACTED:github_token]"],
    expectMissing: ["ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"],
  },
  {
    type: "gitlab_token",
    input: "GitLab: glpat-abcdefghijklmno12345",
    expectContains: ["[REDACTED:gitlab_token]"],
  },
  {
    type: "slack_token",
    input: "xoxb-1234567890-abcdef0123456789",
    expectContains: ["[REDACTED:slack_token]"],
  },
  {
    type: "openai_key",
    input: "OpenAI: sk-proj-abcdefghij0123456789ABCDEFGHIJ0123456789klmn",
    expectContains: ["[REDACTED:openai_key]"],
  },
  {
    type: "anthropic_key",
    input: "Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL_-",
    expectContains: ["[REDACTED:anthropic_key]"],
  },
  {
    type: "stripe_key",
    input: "stripe sk_live_abcdefghijklmnop0123456789",
    expectContains: ["[REDACTED:stripe_key]"],
  },
  {
    type: "jwt",
    input: "Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqb2huIn0.abc123def456ghi789jkl",
    expectContains: ["[REDACTED:jwt]"],
  },
  {
    type: "private_key_block",
    input: "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxF...\n-----END RSA PRIVATE KEY-----",
    expectContains: ["[REDACTED:private_key_block]"],
    expectMissing: ["MIIBOgIBAAJBAKj34GkxF"],
  },
  {
    type: "bearer_token",
    input: "Authorization: Bearer abc123def456ghi789",
    expectContains: ["Bearer [REDACTED:bearer_token]"],
    expectMissing: ["abc123def456ghi789"],
  },
  {
    type: "basic_auth",
    input: "Authorization: Basic dXNlcjpwYXNzd29yZA==",
    expectContains: ["Basic [REDACTED:basic_auth]"],
  },
  {
    type: "db_url_password",
    input: "DATABASE_URL=postgres://app:s3cret!@db:5432/foo",
    expectContains: ["postgres://app:[REDACTED:db_url_password]@db:5432/foo"],
    expectMissing: ["s3cret!"],
  },
  {
    type: "cli_password_flag",
    input: "mysql --password=hunter2 mydb",
    expectContains: ["[REDACTED:cli_password_flag]"],
    expectMissing: ["hunter2"],
  },
  {
    type: "cli_password_short",
    input: "mysql -phunter2 mydb",
    expectContains: ["[REDACTED:cli_password_short]"],
    expectMissing: ["hunter2"],
    context: "bash",
  },
  {
    type: "env_var_secret",
    input: "OPENAI_API_KEY=sk-abc123def456",
    expectContains: ["OPENAI_API_KEY=[REDACTED:env_var_secret]"],
    expectMissing: ["sk-abc123def456"],
  },
];

for (const tc of PATTERN_CASES) {
  check(`pattern ${tc.type}`, () => {
    const out = applySinglePattern(tc.input, tc.type);
    for (const c of tc.expectContains) {
      assert.ok(out.includes(c), `expected output to contain "${c}"; got: ${out}`);
    }
    for (const m of tc.expectMissing ?? []) {
      assert.ok(!out.includes(m), `expected output to NOT contain "${m}"; got: ${out}`);
    }
  });
}

function pipeline(input: string, opts: { context?: "bash" } = {}): string {
  const all = collectMatches(input, opts);
  const kept = resolveOverlaps(all);
  return applyMatches(input, kept);
}

check("overlap: bearer absorbs github_token inside it", () => {
  const input = "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
  const out = pipeline(input);
  assert.ok(out.includes("Bearer [REDACTED:bearer_token]"), out);
  assert.ok(!out.includes("[REDACTED:github_token]"), out);
});

check("overlap: env_var_secret wins over openai_key when capture spans key", () => {
  const input = "OPENAI_API_KEY=sk-proj-abcdefghij0123456789ABCDEFGHIJ0123456789klmn";
  const out = pipeline(input);
  // env_var_secret has a wider whole-match (starts at OPENAI_API_KEY, ends at value end),
  // so it wins under the start-asc / longest-on-tie rule.
  assert.ok(out.includes("OPENAI_API_KEY=[REDACTED:env_var_secret]"), out);
  assert.ok(!out.includes("[REDACTED:openai_key]"), out);
});

check("ordering: independent matches both applied", () => {
  const input = "first AKIAIOSFODNN7EXAMPLE then ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
  const out = pipeline(input);
  assert.ok(out.includes("[REDACTED:aws_access_key]"), out);
  assert.ok(out.includes("[REDACTED:github_token]"), out);
});

check("context guard: cli_password_short ignored without context", () => {
  const input = "mysql -phunter2 mydb";
  const out = pipeline(input); // no context
  assert.equal(out.includes("[REDACTED:cli_password_short]"), false);
});

check("context guard: cli_password_short applied with bash context", () => {
  const input = "mysql -phunter2 mydb";
  const out = pipeline(input, { context: "bash" });
  assert.ok(out.includes("[REDACTED:cli_password_short]"), out);
});

check("redact: empty string passes through", () => {
  assert.equal(redact("", {}), "");
});

check("redact: combines multiple secrets", () => {
  const input = "AKIAIOSFODNN7EXAMPLE and ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
  const out = redact(input);
  assert.ok(out.includes("[REDACTED:aws_access_key]"), out);
  assert.ok(out.includes("[REDACTED:github_token]"), out);
});

// --- negative (false-positive guards) ---
check("negative: 40-byte commit SHA ignored", () => {
  const input = "commit 0123456789abcdef0123456789abcdef01234567 by alice";
  assert.equal(redact(input), input);
});

check("negative: UUID ignored", () => {
  const input = "uuid=550e8400-e29b-41d4-a716-446655440000 done";
  assert.equal(redact(input), input);
});

check("negative: random base64 thumbnail not masked (no context)", () => {
  const input = "thumb=YWJjZGVmZ2hpamtsbW5vcA== loaded";
  assert.equal(redact(input), input);
});

check("negative: 40-char base64 alone (no aws_secret context) ignored", () => {
  const input = "blob=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY end";
  assert.equal(redact(input), input);
});

check("negative: dash-p in normal text without bash context ignored", () => {
  const input = "see also -pretty option";
  assert.equal(redact(input), input);
});

if (failures > 0) {
  process.stdout.write(`\n${failures} failure(s)\n`);
  process.exit(1);
}
process.stdout.write("\nOK\n");
