# pinta-cc marketplace embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a single-plugin marketplace manifest in the `awarecorp/pinta-cc` repo so users can install via `/plugin marketplace add awarecorp/pinta-cc` + `/plugin install pinta-cc@pinta-ai` with auto-update on Claude Code startup.

**Architecture:** Pure manifest + docs change. Add `.claude-plugin/marketplace.json` (single plugin, source `"."`), rename the plugin identifier in `.claude-plugin/plugin.json` from `pinta` to `pinta-cc`, and update the `README.md` install section to lead with the marketplace flow. No code changes, no CI changes.

**Tech Stack:** JSON manifests, Markdown. No new tooling.

**Spec:** `docs/superpowers/specs/2026-04-20-pinta-cc-marketplace-design.md`

---

## File map

| Path | Action | Purpose |
|---|---|---|
| `.claude-plugin/plugin.json` | Modify | Rename `"name": "pinta"` → `"name": "pinta-cc"` |
| `.claude-plugin/marketplace.json` | Create | Single-plugin marketplace manifest, source `"."` |
| `README.md` (install section, ~lines 25-37) | Modify | Lead with marketplace flow; demote raw GitHub install to fallback |

No other files touched. `package.json` `name` field stays `"pinta"` (out of scope per spec).

---

### Task 1: Rename the plugin identifier in `plugin.json`

**Files:**
- Modify: `.claude-plugin/plugin.json`

Why first: Every later step references the new plugin name `pinta-cc`. Locking it in first avoids inconsistencies during the rest of the work.

- [ ] **Step 1: Read the current `plugin.json` to confirm starting state**

Run: `cat .claude-plugin/plugin.json`

Expected (relevant excerpt):
```json
{
  "name": "pinta",
  "description": "Security monitoring plugin - captures all Claude Code events and enforces server-managed access rules",
  "version": "1.1.0",
  ...
}
```

If `"name"` is already `"pinta-cc"`, skip to Step 4.

- [ ] **Step 2: Edit the `name` field**

Use the Edit tool on `.claude-plugin/plugin.json`:
- old_string: `  "name": "pinta",`
- new_string: `  "name": "pinta-cc",`
- replace_all: false

- [ ] **Step 3: Validate JSON is still well-formed**

Run: `python3 -m json.tool < .claude-plugin/plugin.json > /dev/null && echo OK`
Expected: `OK` (no traceback).

- [ ] **Step 4: Confirm no other file expected the old name**

Run: `git grep -n '"pinta"' -- '.claude-plugin/' 'src/' 'hooks/' 'tools/'`

Expected output (these are the only legitimate matches; none are the plugin identifier):
- `package.json:  "name": "pinta",` — the npm package name; intentionally unchanged per spec.
- (no matches inside `.claude-plugin/`, `src/`, `hooks/`, `tools/`)

If anything else surfaces inside `.claude-plugin/`, `src/`, `hooks/`, or `tools/` that expected the literal plugin name `"pinta"`, stop and ask before continuing — the spec did not anticipate it.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore(plugin): rename plugin identifier pinta → pinta-cc"
```

---

### Task 2: Create `.claude-plugin/marketplace.json`

**Files:**
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Confirm the file does not yet exist**

Run: `ls .claude-plugin/marketplace.json 2>&1 || echo "absent"`
Expected: `absent` (or "No such file or directory"). If the file already exists, stop and ask — this plan assumes a clean slate.

- [ ] **Step 2: Write the marketplace manifest**

Write `.claude-plugin/marketplace.json` with this exact content:

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

Notes for the implementer:
- `source: "."` is the relative-path form the docs prescribe for same-repo plugins. The path resolves relative to the marketplace root (the directory containing `.claude-plugin/`, i.e. the repo root).
- `version` is intentionally omitted at the marketplace-entry level — `plugin.json` is the sole canonical version source per spec decision.
- `license` is intentionally omitted (no standalone LICENSE file yet; that's a separate follow-up).

- [ ] **Step 3: Validate JSON is well-formed**

Run: `python3 -m json.tool < .claude-plugin/marketplace.json > /dev/null && echo OK`
Expected: `OK` (no traceback).

- [ ] **Step 4: Confirm structural integrity matches the schema**

Run:
```bash
python3 -c "
import json
m = json.load(open('.claude-plugin/marketplace.json'))
assert m['name'] == 'pinta-ai', f\"name = {m['name']!r}\"
assert m['owner']['name'] == 'awarecorp', f\"owner.name = {m['owner']['name']!r}\"
assert len(m['plugins']) == 1, f\"plugins length = {len(m['plugins'])}\"
p = m['plugins'][0]
assert p['name'] == 'pinta-cc', f\"plugin name = {p['name']!r}\"
assert p['source'] == '.', f\"plugin source = {p['source']!r}\"
print('OK')
"
```
Expected: `OK`. Any AssertionError means the manifest content drifted from the spec — re-write it in Step 2.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat(marketplace): add single-plugin marketplace manifest

Marketplace name: pinta-ai. Embeds pinta-cc with source \".\"
(same-repo) so /plugin install pinta-cc@pinta-ai works against
this repo directly."
```

---

### Task 3: Update README install section

**Files:**
- Modify: `README.md` (install section, lines ~25-37)

- [ ] **Step 1: Locate the current install section**

Run: `grep -n "^## Installation\|^### Install" README.md`
Expected output (line numbers may differ slightly):
```
25:## Installation
27:### Install from GitHub
33:### Install from a local directory
```

If the section headings are missing or read differently (e.g., the README has been re-translated to Korean), re-read the file and adapt the text replacements below to match the actual surrounding wording. The replacement intent is unchanged: lead with the marketplace flow, demote the raw GitHub install to a fallback, and keep the local-directory subsection as-is.

- [ ] **Step 2: Replace the install section**

Use the Edit tool on `README.md`:

- old_string:
```
## Installation

### Install from GitHub

```bash
claude plugin install github:awarecorp/pinta-cc
```

### Install from a local directory

```bash
claude --plugin-dir /path/to/pinta-cc
```
```

- new_string:
```
## Installation

### Install from the marketplace (recommended)

```bash
/plugin marketplace add awarecorp/pinta-cc
/plugin install pinta-cc@pinta-ai
```

After installation, Claude Code automatically pulls new versions from the marketplace on every startup.

### Install directly from GitHub (alternative)

```bash
claude plugin install github:awarecorp/pinta-cc
```

### Install from a local directory (development)

```bash
claude --plugin-dir /path/to/pinta-cc
```
```

- replace_all: false

- [ ] **Step 3: Confirm the new section is in place**

Run: `grep -n "marketplace add awarecorp/pinta-cc\|plugin install pinta-cc@pinta-ai" README.md`
Expected output (exact substrings, line numbers may differ):
```
<line>:/plugin marketplace add awarecorp/pinta-cc
<line>:/plugin install pinta-cc@pinta-ai
```
Both lines must appear. If only one shows, the Edit silently failed — re-apply Step 2.

- [ ] **Step 4: Confirm the legacy install command was preserved as a fallback**

Run: `grep -n "claude plugin install github:awarecorp/pinta-cc" README.md`
Expected: exactly one match. If zero, the fallback was accidentally removed; re-apply Step 2. If two or more, the section was duplicated; investigate and fix.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): lead install section with marketplace flow"
```

---

### Task 4: Operator verification (post-merge, manual)

> This task is intentionally manual — it requires a real `claude` CLI session, real marketplace registration, and a working hook trigger. An implementer subagent **cannot** complete this task; mark it complete only after the human operator (the user) has run through it.

**Files:** None modified by the implementer.

- [ ] **Step 1: Local marketplace smoke (pre-push)**

In a fresh Claude Code session (any cwd is fine):

```
/plugin marketplace add /Users/deerfried/mcypher/pinta-ai/adaptor/pinta-cc
/plugin install pinta-cc@pinta-ai
```

Expected: both commands succeed without errors. The plugin appears in the active plugin list.

If the first command fails with a schema error mentioning `source`, the spec's Error-handling fallback applies: edit `.claude-plugin/marketplace.json` and replace `"source": "."` with the object form `{"source": "github", "repo": "awarecorp/pinta-cc"}`, re-run `python3 -m json.tool < .claude-plugin/marketplace.json > /dev/null && echo OK`, commit (`fix(marketplace): use object source form for same-repo plugin`), and retry this step.

- [ ] **Step 2: Hook fires correctly**

In the same Claude Code session, run the mock server in another terminal:

```bash
cd /Users/deerfried/mcypher/pinta-ai/adaptor/pinta-cc
npm run mock-server
```

Set the plugin endpoint to the mock server in Claude Code settings:
- `endpoint` = `http://localhost:3000`
- `api_key` = anything non-empty (mock server does not validate)

Submit any prompt in Claude Code (this triggers `UserPromptSubmit`, then `PreToolUse` if a tool is invoked).
Expected: the mock server's web UI at `http://localhost:3000` shows incoming spans with `cc.hook` attribute set to the relevant hook event name. No errors in the Claude Code session about missing `dist/index.js` or unresolved identity (assuming `pinta login` has been done).

- [ ] **Step 3: Push and verify GitHub install on a clean machine (or fresh shell)**

After steps 1-2 pass locally, push the three commits to `main`. Wait for the `Build dist` workflow (Step 1+5) to run and (if dist changed) commit a `chore(dist): rebuild for <sha>` follow-up.

Then on a clean machine (or a Claude Code session with no plugin cache):

```
/plugin marketplace add awarecorp/pinta-cc
/plugin install pinta-cc@pinta-ai
```

Expected: both succeed without GitHub authentication (the repo is now public per Step 1+5 follow-up). Trigger any hook and verify it fires (mock server or real Pinta backend).

- [ ] **Step 4: Auto-update sanity**

Bump `plugin.json` `version` (e.g., `"1.1.0"` → `"1.1.1"`), commit, and push. Wait for the `Build dist` workflow to complete.

Restart Claude Code (close and reopen the session).

Expected: the marketplace auto-update on startup picks up the new version. Confirm by checking the plugin's reported version in `/plugin list` (or whatever the active CLI exposes — exact UI command may differ).

- [ ] **Step 5: Mark this task complete**

If steps 1-4 all pass, mark the task complete. If any step fails, refer back to the spec's "Error handling" table for recovery options before re-attempting.

No commit step — Task 4 is verification, not a code change.

---

## Rollout checklist

- [ ] Task 1 plugin.json rename committed
- [ ] Task 2 marketplace.json committed
- [ ] Task 3 README install section committed
- [ ] Task 4 operator verification complete (all 4 steps green)

Once all four are checked, Step 2 of the distribution roadmap is done and `/plugin install pinta-cc@pinta-ai` is the recommended install path.
