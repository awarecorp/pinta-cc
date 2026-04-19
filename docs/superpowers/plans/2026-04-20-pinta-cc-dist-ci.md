# pinta-cc dist CI + README cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land two GitHub Actions workflows (`pr-validate.yml`, `build-dist.yml`) and a README placeholder fix so that `claude plugin install github:awarecorp/pinta-plugin` produces a working plugin from `main` HEAD without contributors committing build artifacts.

**Architecture:** Two independent workflow files under `.github/workflows/`. PR workflow runs `build` + `test:redact` with read-only permissions. Main-push workflow uses `paths-ignore: ['dist/**']` to break the bot self-trigger loop, force-adds `dist/` (which stays in `.gitignore`), and pushes a `github-actions[bot]` commit back to `main`. README install command updated to the real `awarecorp/pinta-plugin` repo.

**Tech Stack:** GitHub Actions, Node 22, npm, bash. No new code dependencies.

**Spec:** `docs/superpowers/specs/2026-04-20-pinta-cc-dist-ci-design.md`

---

## File map

| Path | Action | Purpose |
|---|---|---|
| `.github/workflows/pr-validate.yml` | Create | PR-time build + redact-test gate |
| `.github/workflows/build-dist.yml` | Create | main-push dist rebuild + bot commit |
| `README.md` (lines 30, 36, 139) | Modify | Replace `your-org/pinta-cc` and `/path/to/pinta-cc` placeholders with `awarecorp/pinta-plugin` |
| `.gitignore` | **Unchanged** | `dist/` stays ignored; CI uses `git add -f` |

---

### Task 1: PR validation workflow

**Files:**
- Create: `.github/workflows/pr-validate.yml`

- [ ] **Step 1: Confirm `.github/workflows/` does not yet exist**

Run: `ls .github/workflows/ 2>&1 || echo "absent"`
Expected: `absent` (or "No such file or directory"). If a workflow already exists, stop and ask — this plan assumes a clean slate.

- [ ] **Step 2: Create the workflow file**

Write `.github/workflows/pr-validate.yml`:

```yaml
name: PR validate

on:
  pull_request:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run test:redact
```

- [ ] **Step 3: Validate YAML syntactically**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pr-validate.yml'))" && echo OK`
Expected: `OK` printed, no traceback.

- [ ] **Step 4: Stage and commit**

```bash
git add .github/workflows/pr-validate.yml
git commit -m "ci: add PR validate workflow (build + test:redact)"
```

---

### Task 2: Main-push dist build workflow

**Files:**
- Create: `.github/workflows/build-dist.yml`

- [ ] **Step 1: Create the workflow file**

Write `.github/workflows/build-dist.yml`:

```yaml
name: Build dist

on:
  push:
    branches: [main]
    paths-ignore:
      - 'dist/**'

permissions:
  contents: write

concurrency:
  group: build-dist-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build-and-commit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Commit dist if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -f dist/
          if git diff --cached --quiet; then
            echo "No dist changes; nothing to commit."
            exit 0
          fi
          git commit -m "chore(dist): rebuild for ${GITHUB_SHA}"
          git push
```

- [ ] **Step 2: Validate YAML syntactically**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-dist.yml'))" && echo OK`
Expected: `OK` printed, no traceback.

- [ ] **Step 3: Stage and commit**

```bash
git add .github/workflows/build-dist.yml
git commit -m "ci: add build-dist workflow (rebuild dist on main, bot commits back)"
```

---

### Task 3: README placeholder cleanup

**Files:**
- Modify: `README.md` (lines 30, 36, 139)

- [ ] **Step 1: Confirm exact placeholder occurrences**

Run: `grep -n "your-org\|/path/to/pinta-cc" README.md`
Expected output (exact):
```
30:claude plugin install github:your-org/pinta-cc
36:claude --plugin-dir /path/to/pinta-cc
139:claude --plugin-dir /path/to/pinta-cc
```

If the line numbers differ, take the line numbers from grep — the text replacements below are unique and don't depend on line position.

- [ ] **Step 2: Replace the GitHub install command (line 30)**

Use the Edit tool:
- old_string: `claude plugin install github:your-org/pinta-cc`
- new_string: `claude plugin install github:awarecorp/pinta-plugin`
- replace_all: false

- [ ] **Step 3: Replace local plugin-dir examples (lines 36 and 139, identical strings)**

Use the Edit tool:
- old_string: `claude --plugin-dir /path/to/pinta-cc`
- new_string: `claude --plugin-dir /path/to/pinta-plugin`
- replace_all: true

Rationale: same substring appears twice. After cloning `git clone git@github.com:awarecorp/pinta-plugin.git`, the local directory is `pinta-plugin/`, so the example path should match.

- [ ] **Step 4: Confirm no over-replacement**

Run: `grep -n "pinta-cc" README.md`
Expected output (exact):
```
157:- `telemetry.sdk.name = "pinta-cc"`, `telemetry.sdk.version = <플러그인 버전>`
```

This single remaining occurrence is the OTLP `telemetry.sdk.name` attribute value, which is a technical identifier emitted by `src/core/otlp.ts` and intentionally stays as `pinta-cc`. Do **not** replace it.

- [ ] **Step 5: Confirm no remaining `your-org` placeholders**

Run: `grep -n "your-org" README.md`
Expected: no output (exit code 1 from grep is fine).

- [ ] **Step 6: Stage and commit**

```bash
git add README.md
git commit -m "docs(readme): point install commands at awarecorp/pinta-plugin"
```

---

### Task 4: Operator verification (post-merge, manual)

> This task is intentionally manual — it requires a real GitHub push, real Actions runs, and a clean install on a separate machine. An implementer subagent **cannot** complete this task; mark it complete only after the human operator (the user) has run through it.

**Files:** None modified by the implementer.

- [ ] **Step 1: Confirm Actions write permission**

GitHub UI → repo Settings → Actions → General → "Workflow permissions": confirm **"Read and write permissions"** is selected. Without this, the bot push in Task 2 fails with a 403.

- [ ] **Step 2: Verify pr-validate via dummy PR**

Open a PR with any no-op change (e.g., add a trailing newline to `README.md` on a feature branch). Watch the Actions tab.
Expected: "PR validate" workflow runs to ✅ green. Job log shows `npm run build` and `npm run test:redact` both passing.

- [ ] **Step 3: Trigger build-dist with a real source change**

After merging the workflows + README cleanup to `main`, push a source-affecting commit (the merge commit itself counts).
Expected: "Build dist" workflow runs once, completes ✅ green, and `git log main` shows a new commit titled `chore(dist): rebuild for <sha>` authored by `github-actions[bot]`.

- [ ] **Step 4: Confirm no infinite loop**

Watch the Actions tab for ~2 minutes after the bot commit in Step 3 lands.
Expected: **NO** additional "Build dist" run is triggered by the bot's own push (the `paths-ignore: ['dist/**']` clause is filtering it out).

If a second run does trigger, the loop guard failed. Recovery (per spec error table): edit `build-dist.yml` to add `[skip ci]` to the bot commit message OR add `if: github.actor != 'github-actions[bot]'` on the job.

- [ ] **Step 5: No-op push test**

Push a doc-only commit to `main` that does not affect built output (e.g., a typo fix in a `.md` file).
Expected: "Build dist" workflow runs, but the "Commit dist if changed" step prints `No dist changes; nothing to commit.` and exits 0. No new bot commit on `main`.

- [ ] **Step 6: End-user install smoke**

On a clean machine (or a fresh shell with no plugin cache):
```bash
claude plugin install github:awarecorp/pinta-plugin
```
Then trigger any hook in Claude Code (e.g., open a session, submit a prompt).
Expected: the install succeeds and the hook fires without errors about missing `dist/index.js`.

- [ ] **Step 7: Mark this task complete**

If all six steps above pass, mark this task complete. If any step fails, refer back to the spec's "Error handling" table for recovery options before re-attempting.

No commit step — Task 4 is verification, not a code change.

---

## Rollout checklist

- [ ] Task 1 PR validate workflow committed
- [ ] Task 2 build-dist workflow committed
- [ ] Task 3 README placeholders fixed and committed
- [ ] Task 4 operator verification complete (all 6 steps green)

Once all four are checked, Step 1+5 from the distribution roadmap is done and `claude plugin install github:awarecorp/pinta-plugin` is the supported install path. Step 2 (marketplace repo) is the next spec.
