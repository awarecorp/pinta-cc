# pinta-cc dist CI + README placeholder cleanup — Design

**Date:** 2026-04-20
**Repo:** `git@github.com:awarecorp/pinta-cc.git` (current main)
**Scope:** Step 1+5 of plugin distribution roadmap. Marketplace repo (Step 2) is a separate spec.

## Goal

Make `dist/` available on `main` to every install path (`claude plugin install github:awarecorp/pinta-cc` today, marketplace path later) without requiring contributors to commit build artifacts. PR-time validation prevents broken main.

## Background

- The plugin runs from `dist/index.js` (per `hooks/hooks.json`).
- `dist/` is currently `.gitignored` and not present on `main`. A user running `claude plugin install github:awarecorp/pinta-cc` today gets a non-functional plugin (no `dist/`).
- `CLAUDE.md` already specifies the intended model: "GitHub Actions가 빌드·커밋한다 (로컬 `dist/`는 `.gitignore` 대상)". This spec implements that contract.
- README has placeholder `your-org/pinta-cc` referencing a wrong org and wrong repo name.

Out of scope and deferred to a separate spec:
- Marketplace repo (`marketplace.json`, plugin install command transition)
- Branch protection rules (GitHub UI)
- npm publish, GitHub Releases

## Deployment prerequisites (manual, one-time)

These are not part of the workflow files but must hold for the design to function:

- Repo settings → Actions → Workflow permissions: confirm "Read and write permissions" is allowed (or that `contents: write` is permitted per-workflow). Without this the bot push fails.
- If branch protection on `main` is later enabled to require PR review, the `github-actions[bot]` actor must be in the bypass list, or `build-dist.yml` will be unable to push back to `main`.

## Architecture

Two GitHub Actions workflows under `.github/workflows/`:

```
.github/workflows/
├── pr-validate.yml   # Pull request validation (no commits)
└── build-dist.yml    # main push → rebuild dist → bot commit back to main
```

These are independent units. PR validation never writes to the repo. Dist build only runs on main, and uses `paths-ignore: ['dist/**']` to break the trigger loop caused by the bot's own push.

### Why split into two workflows

- Different triggers (PR vs main push) and different permissions (read-only vs `contents: write`) collapse poorly into one job.
- Failure modes are different: PR validate failure blocks merge; build-dist failure means main is broken and needs operator attention.
- Easier to disable one without the other (e.g., temporarily skip dist commits without losing PR validation).

## Components

### 1. `.github/workflows/pr-validate.yml`

**Trigger:** `pull_request` (default base: any branch where this workflow file exists).

**Permissions:**

```yaml
permissions:
  contents: read
```

Explicit even though `read` is the default — keeps intent legible and survives any future change to repo-wide default permissions.

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 22` and `cache: 'npm'`
3. `npm ci`
4. `npm run build` (must succeed → `tsc` exit 0)
5. `npm run test:redact` (must succeed → all cases pass)

**No git mutation.** No upload-artifact (dist is rebuilt on main, so artifact retention adds no value here).

### 2. `.github/workflows/build-dist.yml`

**Trigger:**

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'dist/**'
```

The `paths-ignore` clause is the loop-breaker: when the bot pushes a dist-only commit, this workflow does not re-trigger.

**Permissions:**

```yaml
permissions:
  contents: write
```

**Concurrency:** group on `build-dist-${{ github.ref }}`, cancel-in-progress: false. Prevents two simultaneous main pushes from racing each other and producing duplicate dist commits.

**Steps:**
1. `actions/checkout@v4` (default shallow checkout is fine; `git push` of new commits does not need full history) with `token: ${{ secrets.GITHUB_TOKEN }}`
2. `actions/setup-node@v4` with `node-version: 22` and `cache: 'npm'`
3. `npm ci`
4. `npm run build`
5. Commit dist if changed:
   ```bash
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

The `git add -f` is required because `dist/` stays in `.gitignore`.

The "no dist changes" branch is the common case for source-only edits (README typo, comments, etc.) — the bot stays silent.

### 3. `.gitignore` policy

`dist/` remains in `.gitignore`. Rationale:
- Contributors who run `npm run build` locally for testing have an untracked `dist/`. They cannot accidentally commit it.
- The CI bot uses `git add -f` to bypass the ignore for its single commit. Single explicit producer = clear ownership.
- `CLAUDE.md` already specifies this; we are implementing the documented contract.

### 4. README placeholder fixes

Scope: only the placeholders that are **decidable today**.

Replacements (all occurrences):
- `your-org/pinta-cc` → `awarecorp/pinta-cc`

Not changed in this spec:
- The `claude plugin install github:...` command itself stays. Marketplace install path (`/plugin install pinta-cc@<marketplace>`) becomes the recommended path in Step 2 and rewrites this section then.
- The `awarecorp/aware-cli` reference in the Pinta CLI install snippet — already correct.

## Data flow

```
Developer pushes source change to PR
  → pr-validate.yml runs build + test:redact
  → green → merge into main

Merge into main
  → build-dist.yml runs (source paths changed, not dist/)
  → npm ci && npm run build
  → if dist/ diff: bot commits "chore(dist): rebuild for <sha>" and pushes
  → push lands on main, but paths-ignore: ['dist/**'] prevents re-trigger

User runs `claude plugin install github:awarecorp/pinta-cc`
  → Claude Code clones main HEAD, finds dist/index.js, hooks work.
```

## Error handling

| Failure | Behavior | Recovery |
|---|---|---|
| `npm ci` fails on PR | PR validate marked failed; merge blocked by branch protection (if configured) | Fix lockfile / dep |
| `tsc` fails on PR | PR validate marked failed | Fix compile error |
| `test:redact` fails on PR | PR validate marked failed | Fix regex |
| `npm ci` / `tsc` fails on main (e.g., bypassed PR) | build-dist marked failed; main has stale or missing dist | Operator pushes fix to main; next push retries |
| Bot push rejected (e.g., concurrent main push race) | build-dist marked failed | Re-run workflow; idempotent |
| Bot pushes but `paths-ignore` fails to apply | Infinite loop. Detected by GitHub workflow run count climbing. | Add `[skip ci]` to commit message as fallback, or guard with `if: github.actor != 'github-actions[bot]'` |

The loop-protection guard is the highest-risk failure; the spec uses `paths-ignore` as primary and documents `[skip ci]` as a manual fallback if `paths-ignore` is observed to misfire.

## Testing / verification

This spec ships infrastructure, not code, so testing is operator-driven:

1. **Workflow files commit** — push to a feature branch, open PR, watch `pr-validate.yml` run end-to-end (build pass, test:redact pass).
2. **Dummy main push** — after merging the workflows, make a small README/source edit that produces a dist diff (e.g., bump a version string). Push to main. Verify `build-dist.yml` runs once, the bot commits a dist diff, and a *second* run is **not** triggered by the bot push.
3. **No-op main push** — make a doc-only edit that does not affect built output. Verify `build-dist.yml` runs but exits with "No dist changes; nothing to commit."
4. **End-user install smoke** — `claude plugin install github:awarecorp/pinta-cc` on a clean machine. Verify the plugin loads (`hooks/hooks.json` resolves to a working `dist/index.js`).

## Decisions log

| Decision | Choice | Why |
|---|---|---|
| Version sources | `plugin.json` is the only canonical version | `package.json` version is unused (no npm publish); avoid double-bump complexity |
| dist commit producer | CI bot only | Contributors keep clean working tree; single producer |
| dist in `.gitignore` | Yes | Prevents accidental contributor commits; CI uses `git add -f` |
| Workflow count | 2 (PR + main) | Different triggers/permissions; clean separation |
| Loop protection | `paths-ignore: ['dist/**']` | Native GitHub mechanism; no commit-message convention dependency |
| Node version | 22 | Current LTS; no engines field today, so pin in CI |
| README install command | Keep `github:` form for now | Marketplace path lands in Step 2 spec |

## Open questions for later (Step 2 territory, not blocking)

- Marketplace repo name and visibility (public vs. private to enterprise customers).
- Whether marketplace.json version should auto-sync from plugin.json via CI, or be manually bumped.
- Whether dist commit should also tag the repo (`v1.1.0`) so marketplace can reference tags instead of SHAs.
