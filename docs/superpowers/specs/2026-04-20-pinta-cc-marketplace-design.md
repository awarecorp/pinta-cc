# pinta-cc marketplace embed — Design

**Date:** 2026-04-20
**Repo:** `git@github.com:awarecorp/pinta-cc.git` (now public, post Step 1+5)
**Scope:** Step 2 of plugin distribution roadmap. Embeds a single-plugin marketplace manifest into the existing plugin repo so users can install via `/plugin install pinta-cc@pinta-ai` and receive auto-updates on Claude Code startup.

## Goal

Make `awarecorp/pinta-cc` a Claude Code marketplace that ships exactly one plugin (itself), so the supported install flow becomes:

```
/plugin marketplace add awarecorp/pinta-cc
/plugin install pinta-cc@pinta-ai
```

The repo is now public (Step 1+5 complete), so this works without GitHub authentication. Auto-updates on startup come for free from the Claude Code marketplace mechanism.

## Background

- Step 1+5 made `dist/` available on `main` (CI bot rebuild) and pointed README install commands at `awarecorp/pinta-cc`. The `claude plugin install github:awarecorp/pinta-cc` flow already works.
- The marketplace path adds: (a) named install (`pinta-cc@pinta-ai`) instead of repo URL, (b) automatic version sync on Claude Code startup, (c) a clean extension point for future plugins.
- CLAUDE.md positions this as the **Enterprise plugin**; OSS spinoff is a separate future repo and is **not** added to this marketplace today.

## Out of scope (deferred)

- Branch protection on `main` (GitHub UI; orthogonal).
- Managed settings (`extraKnownMarketplaces`, `strictKnownMarketplaces` with SHA pinning) — relevant for centrally-managed enterprise rollouts; not needed for the basic install flow.
- npm publish, GitHub Releases, semver tag automation.
- OSS plugin spinoff (separate repo, separate spec).
- Marketplace `displayName`, screenshots, rich metadata for a public catalog — not blocking for current install UX.
- A standalone `LICENSE` file at repo root (mentioned in security review as a follow-up; tracked as a separate item, not part of this spec).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Marketplace location | Embed in `awarecorp/pinta-cc` at `.claude-plugin/marketplace.json` | YAGNI. Single plugin today; OSS spinoff goes to its own repo. Migration to a dedicated marketplace repo costs little when/if needed. |
| Marketplace `name` | `pinta-ai` | Matches the `pinta-ai/` monorepo identifier. Allows future Pinta-family plugins (`mcp-logger@pinta-ai`, etc.) to live alongside without renaming. Kebab-case ✅, not in reserved list ✅. |
| Plugin `name` | `pinta-cc` (renamed from `pinta`) | Matches repo name. Disambiguates from the Pinta CLI binary (`pinta`) and from sister adapters (`pinta-codex`). Already the canonical identifier in `src/core/otlp.ts` (`telemetry.sdk.name = "pinta-cc"`). |
| Plugin `source` | `"."` (relative path string) | Per docs, same-repo plugins use a relative path string, not a `{source: "github", ...}` object. The path resolves relative to the marketplace root (the directory containing `.claude-plugin/`). |
| `plugin.json` `version` field | Stays canonical | Marketplace.json `version` field is ignored by the runtime; `plugin.json` wins. Avoids double-bump complexity. We do not duplicate the version in `marketplace.json`. |
| Marketplace `owner` | `{ name: "awarecorp", email: "dev@pinta.sh" }` | `name` is required by the schema. Email matches the git author identity already in use. |

## Architecture

```
awarecorp/pinta-cc/
├── .claude-plugin/
│   ├── plugin.json         # MODIFY: rename "pinta" → "pinta-cc"
│   └── marketplace.json    # CREATE
├── README.md               # MODIFY: install section
├── dist/                   # (unchanged, CI-built)
├── hooks/hooks.json        # (unchanged)
└── src/                    # (unchanged)
```

No new directories, no new build steps, no CI changes. Pure manifest + docs.

### `.claude-plugin/marketplace.json` (new)

```json
{
  "name": "pinta-ai",
  "owner": {
    "name": "awarecorp",
    "email": "dev@pinta.sh"
  },
  "plugins": [
    {
      "name": "pinta-cc",
      "source": ".",
      "description": "Claude Code security monitoring plugin — emits OTLP spans for hook events and fail-closes on missing Pinta identity.",
      "homepage": "https://github.com/awarecorp/pinta-cc",
      "repository": "https://github.com/awarecorp/pinta-cc",
      "category": "security"
    }
  ]
}
```

Notes:
- `version` deliberately omitted at the marketplace-entry level — `plugin.json` is the sole canonical version source.
- `license` deliberately omitted until the standalone LICENSE file lands (separate follow-up). `plugin.json` already declares `"license": "MIT"`.
- `category` set to `security` for discoverability if a public catalog ever surfaces categories.

### `.claude-plugin/plugin.json` (modify)

Single change: `"name": "pinta"` → `"name": "pinta-cc"`. All other fields unchanged.

This aligns the plugin identifier with: the repo name, the OTLP `telemetry.sdk.name` attribute (already `pinta-cc`), the install command (`pinta-cc@pinta-ai`), and the auth-required message (already references `[pinta-cc]` in `src/handlers/auth-message.ts:1`).

### `README.md` (modify)

Replace the current install section (lines ~25-37) so the marketplace flow becomes the primary path. The legacy `claude plugin install github:awarecorp/pinta-cc` form still works (GitHub repo install is an independent mechanism in Claude Code) but is demoted to a fallback.

Proposed new section:

```markdown
## 설치

### Marketplace로 설치 (권장)

```bash
/plugin marketplace add awarecorp/pinta-cc
/plugin install pinta-cc@pinta-ai
```

설치 후 Claude Code가 시작될 때마다 marketplace에서 새 버전을 자동으로 pull합니다.

### 직접 설치 (대안)

```bash
claude plugin install github:awarecorp/pinta-cc
```

### 로컬 디렉토리로 설치 (개발용)

```bash
claude --plugin-dir /path/to/pinta-cc
```
```

The "설정" section below stays unchanged.

## Data flow

```
User runs: /plugin marketplace add awarecorp/pinta-cc
  → Claude Code clones the repo, reads .claude-plugin/marketplace.json
  → Registers marketplace "pinta-ai" containing one plugin "pinta-cc"

User runs: /plugin install pinta-cc@pinta-ai
  → Claude Code resolves source "." → uses the same already-cloned repo
  → Reads .claude-plugin/plugin.json → activates hooks per hooks/hooks.json
  → Plugin runs from dist/index.js (built by CI per Step 1+5)

Next Claude Code startup:
  → Marketplace auto-update fetches new commits on main
  → If plugin.json version changed, plugin updates in place (best-effort)
```

## Migration impact

- Plugin identifier in `plugin.json` changes from `pinta` to `pinta-cc`. Any user who installed an earlier version (when the name was `pinta`) will likely see it as a different plugin on the next install. Given current usage is internal/dev only, the blast radius is minimal — a one-time `/plugin uninstall pinta` may be needed.
- The OTLP attribute `telemetry.sdk.name = "pinta-cc"` was already `pinta-cc`, so server-side parsers see no change.
- `package.json` `name` field stays `"pinta"` and is **not** renamed in this spec. It's never published to npm, so the field is internal only and does not need to match the plugin identifier. Renaming is a separate cleanup if ever desired.

## Error handling

| Failure | Behavior | Recovery |
|---|---|---|
| Marketplace `name` already taken globally | `/plugin marketplace add` rejects with a name-collision error | Choose alternate `name` (e.g., `awarecorp`, `pinta-tools`) and re-commit. Cheap. |
| Source path `"."` rejected by validator | Marketplace registration fails with schema error | Fall back to `{"source": "github", "repo": "awarecorp/pinta-cc"}` form. Functionally equivalent for a same-repo plugin; verbose but unambiguous. |
| Auto-update fetches a broken `main` commit | Plugin install fails on next startup | Step 1+5 PR validation gates broken builds at PR time. If a bad commit lands anyway, fix-forward on `main`. |
| User on old `pinta` install collides with new `pinta-cc` install | Two plugins active, both running on every hook | Document `/plugin uninstall pinta` in release notes. |

## Testing / verification

This spec ships manifest + docs, not code. Verification is operator-driven:

1. **Schema validity** — `cat .claude-plugin/marketplace.json | python3 -m json.tool` succeeds (well-formed JSON).
2. **Local install smoke** — In a fresh Claude Code session: `/plugin marketplace add /absolute/path/to/pinta-cc` (local path form), then `/plugin install pinta-cc@pinta-ai`. Trigger any hook (e.g., submit a prompt) and confirm the OTLP request fires (use the mock server: `npm run mock-server`).
3. **GitHub install smoke** (post-merge) — On a clean machine: `/plugin marketplace add awarecorp/pinta-cc`, then `/plugin install pinta-cc@pinta-ai`. Same hook-trigger check.
4. **Auto-update sanity** (post-merge) — Bump `plugin.json` version on `main`. Restart Claude Code. Confirm the new version is picked up without manual reinstall.

## Open questions for later (not blocking)

- Adding a standalone `LICENSE` file at repo root (security review follow-up). Trivial — a separate small change.
- Whether to populate marketplace `displayName`, screenshots, longer description for a public catalog. Punt until a catalog actually exists.
- Managed settings rollout (`extraKnownMarketplaces`/`strictKnownMarketplaces`) for centrally-managed enterprise customers. Separate spec when that customer arrives.
- OSS plugin spinoff: when it lands, decide whether to add to this marketplace (rename to something more neutral than `pinta-ai`?) or run a separate marketplace.
