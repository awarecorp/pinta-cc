# Changelog

All notable changes to pinta-cc are documented here.

## [1.2.0] - 2026-04-29 (BREAKING)

### BREAKING CHANGES

- **Guard module removed** — PreToolUse no longer evaluates server-side block rules. Enforcement is deferred to a future manager-side endpoint.
- **Pinta CLI dependency removed** — `pinta identity id/email` is no longer invoked. Identity attribution moves to the relay layer (Pinta Manager attaches on forward; OSS users handle in their own pipeline).
- **`api_key` semantics changed** — was: Pinta backend API key sent as `x-api-key`. Now: token sent as `x-pinta-relay-token` header (or any header via `OTEL_EXPORTER_OTLP_HEADERS` override).
- **`endpoint` semantics changed** — was: Pinta backend URL. Now: any OTLP/HTTP traces collector URL.
- **PreToolUse fail-close removed** — without identity to check, the deny path no longer fires. All hooks exit 0 on success, 1 on transport-only failures (handled internally — fail-open).
- **`member.identity.*` resource attributes removed** — relay attaches identity if present.
- **`src/enterprise/` directory removed** — `PintaIdentityResolver`, `PintaGuardClient` deleted.
- **`src/handlers/auth-message.ts` removed** — no auth message to print.
- **`src/core/guard.ts` removed**.

### Added

- `src/core/env-bridge.ts` — aliases Claude Code's `CLAUDE_PLUGIN_OPTION_*` env vars to OTel-spec `OTEL_EXPORTER_OTLP_*`. Explicit OTel env vars take precedence over the bridge.
- `vitest` test suite (`tests/core/*.test.ts`) — covers OTLP builder + env-bridge.
- `hasOtlpEndpoint()` helper in `src/core/config.ts` (currently unused — reserved for future signaling).

### Changed

- `buildOtlpPayload` signature: `{event, traceId, identity, now?}` → `{event, traceId, now?}`.
- `Transport` reads OTel env vars at every send/flush call; silent-disables when endpoint missing (was: `loadConfig()` threw).
- `package.json` name: `pinta` → `@pinta-ai/pinta-cc`.
- `.claude-plugin/plugin.json` description and userConfig descriptions updated for OTel collector framing.
- Mock server (`tools/mock-server.ts`) reduced to a generic OTLP collector + viewer (removed Pinta-backend-specific endpoints).

### Migration

**For Pinta Manager users:** No action required. Pinta Manager M9d will auto-inject `CLAUDE_PLUGIN_OPTION_ENDPOINT` and `CLAUDE_PLUGIN_OPTION_API_KEY` via Claude Code's settings.json. Marketplace install picks up 1.2.0 on next Claude Code startup.

**For standalone users:**
1. Update `endpoint` userConfig to your OTLP/HTTP collector URL.
2. Update `api_key` to whatever token your collector expects (will be sent as `x-pinta-relay-token`).
3. For non-Pinta collectors needing different auth headers, set `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>` directly in the environment — this overrides the userConfig-based bridge.

**Identity attribution:** v1.1's `member.identity.*` resource attrs are gone. If you depended on them in your pipeline, attach them at your collector / forwarder layer.
