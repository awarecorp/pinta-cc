# Pinta

Claude Code security monitoring plugin — converts Claude Code hook events into OTLP spans and sends them to a trace endpoint. Policy evaluation and issue detection are performed asynchronously on the server side.

## Features

- **OTLP transport**: converts 11 hook event types into OTLP/HTTP `resourceSpans` and sends them via `POST {endpoint}/traces`
- **Bronze flattening**: every top-level field of a hook event is flattened into `cc.<key>` attributes (consumed as-is by the server parser)
- **Identity-only fail-close**: if the Pinta CLI identity cannot be resolved, PreToolUse exits with code 2 (deny); every other hook exits with code 1
- **Trace tracking**: a ULID-based `traceId` is assigned per user turn (`UserPromptSubmit` starts a new trace)
- **Retry queue**: on transport failure, payloads are appended to `.plugin-data/failed-spans.jsonl` (cap 1000) and the next hook invocation flushes the batch

## Authentication

This plugin resolves member identity through the Pinta CLI. Install and log in before use:

```bash
curl -fsSL https://raw.githubusercontent.com/awarecorp/aware-cli/main/install.sh | sh
pinta login
pinta identity id     # (optional) verify
```

If the CLI is missing or not logged in, `PreToolUse` is blocked (deny) and all other hooks print a guidance message to stderr and exit 1.

## Installation

### Install from GitHub

```bash
claude plugin install github:awarecorp/pinta-cc
```

### Install from a local directory

```bash
claude --plugin-dir /path/to/pinta-cc
```

## Configuration

After installing the plugin, configure the following values in Claude Code:

| Setting | Description | Required |
|---------|-------------|----------|
| `endpoint` | Security server URL (e.g. `https://security.company.com`) | Yes |
| `api_key` | Server API key | Yes |

## Architecture

```
src/
├── index.ts              # Entry point (stdin parse → DI wiring → handler routing)
├── core/                 # OSS-reusable
│   ├── types.ts          # Hook event types, type guards, skip-list
│   ├── config.ts         # Environment variable loader
│   ├── identity.ts       # IdentityResolver interface
│   ├── otlp.ts           # OTLP payload builder + Bronze flattening + ULID→traceId
│   ├── transport.ts      # POST {endpoint}/traces (5s timeout) + retry-queue glue
│   ├── retry-queue.ts    # File-based JSONL queue (cap 1000, 30s stale lock TTL)
│   └── trace.ts          # traceId management (ULID generation, file-based sharing)
├── enterprise/           # Pinta-specific (imported only at DI time)
│   └── pinta-identity.ts # PintaIdentityResolver — invokes `pinta identity id/email`
├── handlers/
│   ├── auth-message.ts   # English guidance message (used when auth is unresolved)
│   ├── pre-tool-use.ts   # Identity check → deny + exit 2 on failure
│   ├── post-tool-use.ts  # PostToolUse + PostToolUseFailure
│   ├── user-prompt.ts    # newTrace() + transmit
│   ├── session.ts        # SessionStart / SessionEnd
│   ├── subagent.ts       # SubagentStart / SubagentStop
│   ├── stop.ts           # Stop
│   ├── permission.ts     # PermissionRequest / PermissionDenied
│   └── default.ts        # skip-list (Notification, etc.) — immediate exit 0
```

### Event flow

```
UserPromptSubmit (generates a new traceId → POST /traces)
  → PreToolUse (identity check → POST /traces)
  → PostToolUse (POST /traces)
  → PreToolUse → PostToolUse → ...
UserPromptSubmit (next turn, new traceId)
  → ...
```

Each hook invocation spawns a fresh Node process. One hook = one OTLP span = `resourceSpans[0].scopeSpans[0].spans[0]`.

### Captured events

PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, SessionStart, SessionEnd, PermissionRequest, PermissionDenied, SubagentStart, SubagentStop, Stop. (Notification, TaskCreated, and TaskCompleted are in the skip-list and exit 0 immediately.)

## Development

### Prerequisites

- Node.js 18+
- TypeScript 5.7+

### Build

```bash
npm install
npm run build
```

### Watch mode

```bash
npm run dev  # tsc --watch
```

### Testing with the mock server

1. Set environment variables (pick one):

```bash
# Option A: use direnv (create .envrc, then direnv allow)
echo 'export CLAUDE_PLUGIN_OPTION_ENDPOINT=http://localhost:3000
export CLAUDE_PLUGIN_OPTION_API_KEY=test-token' > .envrc
direnv allow

# Option B: inline environment variables
CLAUDE_PLUGIN_OPTION_ENDPOINT=http://localhost:3000 \
CLAUDE_PLUGIN_OPTION_API_KEY=test-token \
claude --plugin-dir .
```

2. Run the mock server:

```bash
npm run mock-server
```

3. Open `http://localhost:3000` in a browser to inspect captured events.

4. In another terminal, run Claude Code with the plugin:

```bash
claude --plugin-dir /path/to/pinta-cc
```

The mock server web UI groups events by session and trace; clicking an event shows details (tool input/response, payload, raw JSON).

## Server API

Endpoints expected by Pinta:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/traces` | OTLP/HTTP JSON `resourceSpans` body, `x-api-key: <api_key>` header |

The request body uses the standard OTLP traces format. The server iterates `resourceSpans[].scopeSpans[].spans[]`, persists them to the trace store, and runs asynchronous issue detection. A single hook invocation equals one `resourceSpans` entry and one span; when the retry queue flushes, multiple spans are batched into a single body.

### Span attribute conventions

- `service.name = "claude-code"`, `service.version = <Claude Code CLI version>`
- `telemetry.sdk.name = "pinta-cc"`, `telemetry.sdk.version = <plugin version>`
- `member.identity.id`, `member.identity.email` — values returned by the Pinta CLI
- `cc.hook = <HookEventName>`; every other top-level field of the hook event is flattened into `cc.<key>` (Bronze)

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) — see [LICENSE](LICENSE).

Commercial use is **not permitted** under this license. Noncommercial use (personal projects, research, educational institutions, nonprofits, government) is allowed. For a commercial license, please contact Pinta AI.
