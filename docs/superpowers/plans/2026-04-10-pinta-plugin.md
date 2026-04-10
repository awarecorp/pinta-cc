# Pinta Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 보안 플러그인 — 모든 이벤트를 서버로 전송하고, 서버 관리 룰 기반으로 부적절한 도구 사용을 차단한다.

**Architecture:** hooks.json이 모든 Claude Code 이벤트를 단일 엔트리포인트(`dist/index.js`)로 라우팅. index.ts가 stdin에서 이벤트를 읽고 handler에 분기. core 모듈이 HTTP 통신, 룰 캐시, 헬스체크를 담당.

**Tech Stack:** TypeScript, Node.js native APIs (fetch, crypto, fs, path)

---

## File Structure

```
pinta-plugin/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── src/
│   ├── core/
│   │   ├── types.ts
│   │   ├── config.ts
│   │   ├── client.ts
│   │   ├── cache.ts
│   │   └── health.ts
│   ├── handlers/
│   │   ├── pre-tool-use.ts
│   │   ├── post-tool-use.ts
│   │   ├── user-prompt.ts
│   │   ├── session.ts
│   │   └── default.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.claude-plugin/plugin.json`
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pinta",
  "version": "1.0.0",
  "description": "Claude Code security monitoring plugin",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "pinta",
  "description": "Security monitoring plugin - captures all Claude Code events and enforces server-managed access rules",
  "version": "1.0.0",
  "license": "MIT",
  "userConfig": {
    "server_url": {
      "description": "보안 서버 URL (e.g. https://security.company.com)",
      "sensitive": false
    },
    "auth_token": {
      "description": "서버 인증 토큰",
      "sensitive": true
    }
  }
}
```

- [ ] **Step 4: Create hooks.json**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PermissionDenied": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "TaskCreated": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "TaskCompleted": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }]
  }
}
```

- [ ] **Step 5: Install dependencies and verify**

```bash
npm install && npx tsc --version
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .claude-plugin/plugin.json hooks/hooks.json package-lock.json
git commit -m "chore: scaffold pinta plugin project"
```

---

### Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// --- Claude Code hook event types ---

export interface BaseEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}

export interface PreToolUseEvent extends BaseEvent {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUseEvent extends BaseEvent {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

export interface UserPromptSubmitEvent extends BaseEvent {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

export interface SessionEvent extends BaseEvent {
  hook_event_name: "SessionStart" | "SessionEnd";
}

export type HookEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | UserPromptSubmitEvent
  | SessionEvent
  | BaseEvent;

// --- Type guards ---

export function isPreToolUseEvent(event: BaseEvent): event is PreToolUseEvent {
  return event.hook_event_name === "PreToolUse";
}

export function isPostToolUseEvent(event: BaseEvent): event is PostToolUseEvent {
  return event.hook_event_name === "PostToolUse";
}

export function isUserPromptSubmitEvent(event: BaseEvent): event is UserPromptSubmitEvent {
  return event.hook_event_name === "UserPromptSubmit";
}

export function isSessionEvent(event: BaseEvent): event is SessionEvent {
  return event.hook_event_name === "SessionStart" || event.hook_event_name === "SessionEnd";
}

// --- Server communication types ---

export interface PintaEvent {
  eventId: string;
  timestamp: string;
  sessionId: string;
  eventType: string;
  toolName?: string;
  payload: HookEvent;
}

// --- Rule types ---

export interface Rule {
  id: string;
  action: "block" | "allow";
  toolName: string;
  condition?: string;
  reason: string;
}

export interface RuleCache {
  rules: Rule[];
  lastSynced: string;
  serverVersion: string;
}

// --- Health types ---

export interface HealthState {
  serverUp: boolean;
  lastChecked: string;
  consecutiveFailures: number;
}

// --- Hook output types ---

export interface HookBlockOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add core type definitions and type guards"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/core/config.ts`

- [ ] **Step 1: Create config.ts**

```typescript
import path from "node:path";

export interface PintaConfig {
  serverUrl: string;
  authToken: string;
  pluginRoot: string;
  pluginData: string;
  rulesPath: string;
  healthPath: string;
}

export function loadConfig(): PintaConfig {
  const serverUrl = process.env.CLAUDE_PLUGIN_OPTION_SERVER_URL;
  const authToken = process.env.CLAUDE_PLUGIN_OPTION_AUTH_TOKEN;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;

  if (!serverUrl) throw new Error("CLAUDE_PLUGIN_OPTION_SERVER_URL is not set");
  if (!authToken) throw new Error("CLAUDE_PLUGIN_OPTION_AUTH_TOKEN is not set");
  if (!pluginRoot) throw new Error("CLAUDE_PLUGIN_ROOT is not set");
  if (!pluginData) throw new Error("CLAUDE_PLUGIN_DATA is not set");

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    authToken,
    pluginRoot,
    pluginData,
    rulesPath: path.join(pluginData, "rules.json"),
    healthPath: path.join(pluginData, "health.json"),
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/config.ts
git commit -m "feat: add config module for environment variable loading"
```

---

### Task 4: HTTP Client

**Files:**
- Create: `src/core/client.ts`

- [ ] **Step 1: Create client.ts**

```typescript
import type { PintaConfig } from "./config.js";
import type { PintaEvent, Rule } from "./types.js";

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export class PintaClient {
  private config: PintaConfig;

  constructor(config: PintaConfig) {
    this.config = config;
  }

  async sendEvent(event: PintaEvent): Promise<void> {
    await this.postWithRetry(`${this.config.serverUrl}/api/events`, event);
  }

  async sendEventAsync(event: PintaEvent): Promise<void> {
    this.sendEvent(event).catch(() => {});
  }

  async fetchRules(): Promise<{ rules: Rule[]; version: string }> {
    const response = await this.fetchWithTimeout(`${this.config.serverUrl}/api/rules`, {
      method: "GET",
      headers: this.headers(),
    });
    return response.json();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.serverUrl}/api/health`, {
        method: "GET",
        headers: this.headers(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.authToken}`,
    };
  }

  private async postWithRetry(url: string, body: unknown): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        });
        if (response.ok) return;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < MAX_RETRIES - 1) {
        await this.sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
      }
    }
    throw lastError;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/client.ts
git commit -m "feat: add HTTP client with retry and timeout"
```

---

### Task 5: Health Module

**Files:**
- Create: `src/core/health.ts`

- [ ] **Step 1: Create health.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import type { PintaConfig } from "./config.js";
import type { HealthState } from "./types.js";

const MAX_CONSECUTIVE_FAILURES = 3;

export class HealthManager {
  private state: HealthState;
  private healthPath: string;

  constructor(config: PintaConfig) {
    this.healthPath = config.healthPath;
    this.state = this.load();
  }

  isServerUp(): boolean {
    return this.state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
  }

  getState(): HealthState {
    return { ...this.state };
  }

  recordSuccess(): void {
    this.state = {
      serverUp: true,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: 0,
    };
    this.save();
  }

  recordFailure(): void {
    this.state.consecutiveFailures += 1;
    this.state.lastChecked = new Date().toISOString();
    this.state.serverUp = this.state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
    this.save();
  }

  private load(): HealthState {
    try {
      const data = fs.readFileSync(this.healthPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { serverUp: true, lastChecked: "", consecutiveFailures: 0 };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.healthPath), { recursive: true });
    fs.writeFileSync(this.healthPath, JSON.stringify(this.state, null, 2));
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/health.ts
git commit -m "feat: add health manager with persistence"
```

---

### Task 6: Rule Cache Module

**Files:**
- Create: `src/core/cache.ts`

- [ ] **Step 1: Create cache.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import type { PintaConfig } from "./config.js";
import type { Rule, RuleCache } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface RuleMatchResult {
  action: "block" | "allow";
  reason: string;
}

export class RuleCacheManager {
  private cache: RuleCache;
  private rulesPath: string;

  constructor(config: PintaConfig) {
    this.rulesPath = config.rulesPath;
    this.cache = this.load();
  }

  getRules(): Rule[] {
    return this.cache.rules;
  }

  updateRules(rules: Rule[], version: string): void {
    this.cache = {
      rules,
      lastSynced: new Date().toISOString(),
      serverVersion: version,
    };
    this.save();
  }

  matchRule(toolName: string): RuleMatchResult | null {
    for (const rule of this.cache.rules) {
      if (this.matchesToolName(rule.toolName, toolName)) {
        return { action: rule.action, reason: rule.reason };
      }
    }
    return null;
  }

  isExpired(): boolean {
    if (!this.cache.lastSynced) return true;
    const elapsed = Date.now() - new Date(this.cache.lastSynced).getTime();
    return elapsed > CACHE_TTL_MS;
  }

  private matchesToolName(pattern: string, toolName: string): boolean {
    if (pattern === "*") return true;
    return pattern === toolName;
  }

  private load(): RuleCache {
    try {
      const data = fs.readFileSync(this.rulesPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { rules: [], lastSynced: "", serverVersion: "" };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.rulesPath), { recursive: true });
    fs.writeFileSync(this.rulesPath, JSON.stringify(this.cache, null, 2));
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/cache.ts
git commit -m "feat: add rule cache manager with expiration and matching"
```

---

### Task 7: Session Handler

**Files:**
- Create: `src/handlers/session.ts`

- [ ] **Step 1: Create session.ts**

```typescript
import crypto from "node:crypto";
import type { PintaConfig } from "../core/config.js";
import type { SessionEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { HealthManager } from "../core/health.js";
import { RuleCacheManager } from "../core/cache.js";

export async function handleSession(event: SessionEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);

  if (event.hook_event_name === "SessionStart") {
    const health = new HealthManager(config);
    const isUp = await client.checkHealth();
    if (isUp) {
      health.recordSuccess();
    } else {
      health.recordFailure();
    }

    if (isUp) {
      try {
        const { rules, version } = await client.fetchRules();
        const cache = new RuleCacheManager(config);
        cache.updateRules(rules, version);
      } catch {
        // rule sync failure is non-fatal at session start
      }
    }
  }

  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    payload: event,
  });

  return 0;
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/handlers/session.ts
git commit -m "feat: add session handler with health check and rule sync"
```

---

### Task 8: PreToolUse Handler

**Files:**
- Create: `src/handlers/pre-tool-use.ts`

- [ ] **Step 1: Create pre-tool-use.ts**

```typescript
import crypto from "node:crypto";
import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import { PintaClient } from "../core/client.js";
import { HealthManager } from "../core/health.js";
import { RuleCacheManager } from "../core/cache.js";

export interface PreToolUseResult {
  exitCode: number;
  output: HookBlockOutput | null;
}

function blockOutput(reason: string): HookBlockOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

export async function handlePreToolUse(
  event: PreToolUseEvent,
  config: PintaConfig,
): Promise<PreToolUseResult> {
  const health = new HealthManager(config);
  const client = new PintaClient(config);

  // 1. Check server health
  if (!health.isServerUp()) {
    return { exitCode: 2, output: blockOutput("보안 서버 연결 불가 — 모든 도구 사용이 차단됩니다") };
  }

  // 2. Refresh rules if expired
  const cache = new RuleCacheManager(config);
  if (cache.isExpired()) {
    try {
      const { rules, version } = await client.fetchRules();
      cache.updateRules(rules, version);
      health.recordSuccess();
    } catch {
      health.recordFailure();
      if (!health.isServerUp()) {
        return { exitCode: 2, output: blockOutput("보안 서버 연결 불가 — 모든 도구 사용이 차단됩니다") };
      }
    }
  }

  // 3. Match rules
  const match = cache.matchRule(event.tool_name);
  if (match && match.action === "block") {
    await client.sendEventAsync({
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId: event.session_id,
      eventType: event.hook_event_name,
      toolName: event.tool_name,
      payload: event,
    });
    return { exitCode: 2, output: blockOutput(match.reason) };
  }

  // 4. Allow — send event async
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    toolName: event.tool_name,
    payload: event,
  });

  return { exitCode: 0, output: null };
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/handlers/pre-tool-use.ts
git commit -m "feat: add pre-tool-use handler with rule matching and blocking"
```

---

### Task 9: Remaining Handlers

**Files:**
- Create: `src/handlers/post-tool-use.ts`
- Create: `src/handlers/user-prompt.ts`
- Create: `src/handlers/default.ts`

- [ ] **Step 1: Create post-tool-use.ts**

```typescript
import crypto from "node:crypto";
import type { PintaConfig } from "../core/config.js";
import type { PostToolUseEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";

export async function handlePostToolUse(event: PostToolUseEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    toolName: event.tool_name,
    payload: event,
  });
  return 0;
}
```

- [ ] **Step 2: Create user-prompt.ts**

```typescript
import crypto from "node:crypto";
import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";

export async function handleUserPrompt(event: UserPromptSubmitEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    payload: event,
  });
  return 0;
}
```

- [ ] **Step 3: Create default.ts**

```typescript
import crypto from "node:crypto";
import type { PintaConfig } from "../core/config.js";
import type { BaseEvent } from "../core/types.js";
import { PintaClient } from "../core/client.js";

export async function handleDefault(event: BaseEvent, config: PintaConfig): Promise<number> {
  const client = new PintaClient(config);
  await client.sendEventAsync({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: event.session_id,
    eventType: event.hook_event_name,
    payload: event,
  });
  return 0;
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/handlers/post-tool-use.ts src/handlers/user-prompt.ts src/handlers/default.ts
git commit -m "feat: add post-tool-use, user-prompt, and default handlers"
```

---

### Task 10: Entrypoint

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
import { loadConfig } from "./core/config.js";
import { isPreToolUseEvent, isPostToolUseEvent, isUserPromptSubmitEvent, isSessionEvent } from "./core/types.js";
import type { BaseEvent } from "./core/types.js";
import { handlePreToolUse } from "./handlers/pre-tool-use.js";
import { handlePostToolUse } from "./handlers/post-tool-use.js";
import { handleUserPrompt } from "./handlers/user-prompt.js";
import { handleSession } from "./handlers/session.js";
import { handleDefault } from "./handlers/default.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  let exitCode = 0;

  try {
    const config = loadConfig();
    const raw = await readStdin();
    const event: BaseEvent = JSON.parse(raw);

    if (isPreToolUseEvent(event)) {
      const result = await handlePreToolUse(event, config);
      exitCode = result.exitCode;
      if (result.output) {
        process.stdout.write(JSON.stringify(result.output));
      }
    } else if (isPostToolUseEvent(event)) {
      exitCode = await handlePostToolUse(event, config);
    } else if (isUserPromptSubmitEvent(event)) {
      exitCode = await handleUserPrompt(event, config);
    } else if (isSessionEvent(event)) {
      exitCode = await handleSession(event, config);
    } else {
      exitCode = await handleDefault(event, config);
    }
  } catch (err) {
    process.stderr.write(`[pinta] error: ${err}\n`);
    exitCode = 0;
  }

  process.exit(exitCode);
}

main();
```

- [ ] **Step 2: Full build**

```bash
npx tsc
```

- [ ] **Step 3: Verify dist output**

```bash
ls dist/index.js dist/core/types.js dist/core/client.js dist/core/cache.js dist/core/health.js dist/handlers/pre-tool-use.js
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entrypoint with event routing"
```
