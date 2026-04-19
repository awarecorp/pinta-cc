/**
 * E2E harness for PreToolUse + Guard API wiring.
 *
 * Spins up a local mock server that swaps behavior per scenario via a
 * writable `control` handle, then spawns `node dist/index.js` with a
 * canned PreToolUse event on stdin and asserts exit code / stdout / hits.
 *
 * Run:  npx tsx tools/e2e-guard.ts
 */

import http from "http";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

interface Control {
  guardStatus: number;
  guardBody: unknown;
  guardDelayMs: number;
  tracesStatus: number;
  guardHits: number;
  tracesHits: number;
}

const control: Control = {
  guardStatus: 200,
  guardBody: { decision: "ALLOW", spans: [], traceStored: false },
  guardDelayMs: 0,
  tracesStatus: 200,
  guardHits: 0,
  tracesHits: 0,
};

function resetHits() {
  control.guardHits = 0;
  control.tracesHits = 0;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

const server = http.createServer(async (req, res) => {
  await readBody(req);
  if (req.url === "/guard") {
    control.guardHits++;
    if (control.guardDelayMs > 0) {
      await new Promise((r) => setTimeout(r, control.guardDelayMs));
    }
    res.writeHead(control.guardStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify(control.guardBody));
    return;
  }
  if (req.url === "/traces") {
    control.tracesHits++;
    res.writeHead(control.tracesStatus, { "Content-Type": "application/json" });
    res.end("{}");
    return;
  }
  res.writeHead(404);
  res.end();
});

function listen(): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else throw new Error("no server port");
    });
  });
}

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runPlugin(endpoint: string, event: unknown, dataDir: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn("node", ["dist/index.js"], {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_OPTION_ENDPOINT: endpoint,
        CLAUDE_PLUGIN_OPTION_API_KEY: "test-key",
        CLAUDE_PLUGIN_DATA: dataDir,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString("utf-8")));
    child.stderr.on("data", (c) => (stderr += c.toString("utf-8")));
    child.on("close", (code) => resolve({ exitCode: code, stdout, stderr }));
    child.stdin.write(JSON.stringify(event));
    child.stdin.end();
  });
}

const preToolUseEvent = {
  session_id: "e2e-session",
  transcript_path: "/tmp/e2e-transcript",
  cwd: process.cwd(),
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "echo hello" },
  tool_use_id: "e2e-tool-1",
};

interface Scenario {
  name: string;
  setup: () => void;
  expectExit: number;
  expectStdoutContains?: string[];
  expectStdoutEmpty?: boolean;
  expectGuardHits: number;
  expectTracesHits: number;
}

const scenarios: Scenario[] = [
  {
    name: "S1: guard ALLOW → exit 0, both endpoints hit",
    setup: () => {
      control.guardStatus = 200;
      control.guardBody = { decision: "ALLOW", spans: [], traceStored: false };
      control.tracesStatus = 200;
    },
    expectExit: 0,
    expectStdoutEmpty: true,
    expectGuardHits: 1,
    expectTracesHits: 1,
  },
  {
    name: "S2: guard DENY → exit 2, deny output with evidence reason",
    setup: () => {
      control.guardStatus = 200;
      control.guardBody = {
        decision: "DENY",
        spans: [
          {
            spanId: "span-1",
            decision: "DENY",
            evidences: [
              {
                category: "secret_exfiltration",
                severity: "HIGH",
                detectionRule: "bash_secret_grep",
                signal: { category: "cmd", source: "tool_input", path: "command" },
              },
            ],
          },
        ],
        traceStored: false,
      };
      control.tracesStatus = 200;
    },
    expectExit: 2,
    expectStdoutContains: [
      '"permissionDecision":"deny"',
      "bash_secret_grep",
      "secret_exfiltration",
      "HIGH",
    ],
    expectGuardHits: 1,
    expectTracesHits: 1,
  },
  {
    name: "S3: guard REVIEW → exit 0 (treated as allow)",
    setup: () => {
      control.guardStatus = 200;
      control.guardBody = {
        decision: "REVIEW",
        spans: [{ spanId: "span-1", decision: "REVIEW", evidences: [] }],
        traceStored: false,
      };
      control.tracesStatus = 200;
    },
    expectExit: 0,
    expectStdoutEmpty: true,
    expectGuardHits: 1,
    expectTracesHits: 1,
  },
  {
    name: "S4: guard 500 → fail-open exit 0, traces still hit",
    setup: () => {
      control.guardStatus = 500;
      control.guardBody = { error: "boom" };
      control.tracesStatus = 200;
    },
    expectExit: 0,
    expectStdoutEmpty: true,
    expectGuardHits: 1,
    expectTracesHits: 1,
  },
  {
    name: "S5: guard DENY wins even if traces fails",
    setup: () => {
      control.guardStatus = 200;
      control.guardBody = {
        decision: "DENY",
        spans: [
          {
            spanId: "span-1",
            decision: "DENY",
            evidences: [
              {
                category: "policy",
                severity: "MEDIUM",
                detectionRule: "traces_down_still_block",
                signal: { category: "c", source: "s", path: "p" },
              },
            ],
          },
        ],
        traceStored: false,
      };
      control.tracesStatus = 500;
    },
    expectExit: 2,
    expectStdoutContains: ['"permissionDecision":"deny"', "traces_down_still_block"],
    expectGuardHits: 1,
    expectTracesHits: 1,
  },
];

async function main() {
  const port = await listen();
  const endpoint = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const scenario of scenarios) {
    // fresh data dir per scenario so retry queue from one doesn't leak to next
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pinta-e2e-"));
    resetHits();
    scenario.setup();

    const result = await runPlugin(endpoint, preToolUseEvent, dataDir);

    const problems: string[] = [];
    if (result.exitCode !== scenario.expectExit) {
      problems.push(`exit=${result.exitCode} want=${scenario.expectExit}`);
    }
    if (scenario.expectStdoutEmpty && result.stdout.trim() !== "") {
      problems.push(`stdout not empty: ${JSON.stringify(result.stdout)}`);
    }
    for (const needle of scenario.expectStdoutContains ?? []) {
      if (!result.stdout.includes(needle)) {
        problems.push(`stdout missing ${JSON.stringify(needle)}`);
      }
    }
    if (control.guardHits !== scenario.expectGuardHits) {
      problems.push(`guardHits=${control.guardHits} want=${scenario.expectGuardHits}`);
    }
    if (control.tracesHits !== scenario.expectTracesHits) {
      problems.push(`tracesHits=${control.tracesHits} want=${scenario.expectTracesHits}`);
    }

    if (problems.length === 0) {
      console.log(`PASS  ${scenario.name}`);
      passed++;
    } else {
      console.log(`FAIL  ${scenario.name}`);
      for (const p of problems) console.log(`        - ${p}`);
      if (result.stderr) console.log(`        stderr: ${result.stderr.trim()}`);
      failed++;
      failures.push(scenario.name);
    }

    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  server.close();

  console.log(`\n${passed}/${scenarios.length} passed`);
  if (failed > 0) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
