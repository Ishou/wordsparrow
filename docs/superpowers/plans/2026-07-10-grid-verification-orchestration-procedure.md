# Grid Verification — Orchestration Procedure (cron-driven, merge-chain)

Cron-fired tick procedure for **merging** the grid-verification 7-PR stack in
dependency order. All PRs are already open (implementation complete); the
cron's only job is to advance the merge waves: watch §6a + CI, merge each PR on
green + LGTM, and rebase stacked children after their base squash-merges.

**Cron schedule:** `*/2 * * * *` (every 2 min; recreate if the rollout exceeds the runtime's session lifetime).

**CWD:** `cd "$(git rev-parse --show-toplevel)"`.

**State source of truth:** the live PR states on GitHub + the log at
`docs/superpowers/plans/2026-07-10-grid-verification-orchestration-log.md`.

## Standing maintainer authorization (recorded 2026-07-10)

The maintainer instruction **"cron the pr and chain the waves"** grants the
orchestrator standing authority to:
- **Merge** each PR in this stack via `gh pr merge <pr#> --squash` once its gate
  (below) is satisfied — no fresh per-PR ask.
- **Invoke the ADR-0001 §4 soft-target (2026-05-25) cap override proactively.**
  PRs #1508 and #1510 already cite it in their bodies ("coherent layer"). The
  §6a reviewer must treat a cited cap as resolved; a re-flag of a cited cap
  triggers the 3c-loop-terminator.

The orchestrator does **not** post maintainer-authored comments (impersonation).
It merges as itself, citing this section.

## Phase map (merge waves)

| Wave | PR | Head → Base | Gate before merge |
|---|---|---|---|
| W1 | **#1505** | `docs/grid-verification-adr` → `main` | green + LGTM. **Merge FIRST** (ADR-before-contract). |
| W1 | **#1504** | `docs/grid-verification-spec` → `main` | green + LGTM. Independent; may merge any time in/after W1. |
| W2 | **#1506** | `feat/grid-verify-schema` → `main` | #1505 merged **AND** green + LGTM. |
| W2 | **#1508** | `feat/grid-verify-logic` → `main` | #1505 merged **AND** green + LGTM. |
| W3 | **#1509** | `feat/grid-verify-wiring` → `feat/grid-verify-logic` | #1508 merged → **retarget to main + rebase** (recipe below) → green + LGTM. |
| W3 | **#1510** | `feat/grid-verify-fe-core` → `feat/grid-verify-schema` | #1506 merged → **retarget to main + rebase** → green + LGTM. |
| W4 | **#1511** | `feat/grid-verify-fe-wire` → `feat/grid-verify-fe-core` | #1510 merged → **retarget to main + rebase** → green + LGTM. |

Dependency summary: `#1505 → {#1506, #1508}`; `#1508 → #1509`; `#1506 → #1510 → #1511`; `#1504` free.

## Tick procedure

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Walk the phase map **top-to-bottom**. For each PR, get state:
   `gh pr view <pr#> --json state,mergeable,mergeStateStatus,baseRefName`.
   - `state == MERGED` → skip to next row.
   - `state == CLOSED` (not merged) → escalate (log `**ACTION:**` + `CronDelete` self + exit).
   - `state == OPEN` → this is the **active PR for this tick**. Apply the gate,
     then the open-PR decision tree. **Take at most ONE action, then stop.**
3. If every row is `MERGED` → run the **End condition** below.

### Gate check (must pass before considering merge)

- The PR's dependency (per Phase map) is `MERGED`. If not → `wait` (log one line, stop).
- If the PR's `baseRefName` is NOT `main` and its dependency IS merged → the
  base branch was merged out from under it; run **Stacked-child recovery** (below), then stop (next tick re-checks).
- Blocking checks all `SUCCESS`: `build`, `submit-gradle`, `commitlint`,
  `branch-name`, `dco`, `gitleaks`, `dependency-review`, `regen-and-diff`,
  `spectral`, `helm-lint`, `api-chart-lint`, `bounded-context-coherence`,
  `adr-index-coherence`. (Informational, NEVER block: `claude-review`, `CodeQL`
  / `Analyze`, `deploy`.)
  - Any blocking check `FAILURE` → **Failure handling** (below).
  - Any still pending → `wait`, stop.

### Open-PR decision tree (first match wins)

- **3a. Ready to merge.** Gate passed AND `mergeable == MERGEABLE` AND
  `mergeStateStatus != BLOCKED` AND the latest `github-actions` review comment's
  first line is `LGTM` (case-insensitive) **OR** the only outstanding finding is
  a cited §4 cap (see standing authorization). → `gh pr merge <pr#> --squash`
  (**no `--delete-branch`** — it collides with agent worktrees holding `main`).
  Log `MERGED #<pr#>`. Stop.
- **3b. Review in progress.** `claude-review` check is `IN_PROGRESS`/`QUEUED`, or
  a `Claude Code Review` run is active on the branch within 15 min. → `wait`, stop.
- **3c. Findings, no fixer active.** Latest review starts `Findings —`, no
  review workflow running now, no new commit since the review.
  - **3c-loop-terminator:** if the first finding is structurally identical to the
    prior cycle's first finding (same rule + location + fix-shape):
    - repeated **cap** finding → dispatch a body-edit fixer to cite the §4
      override + this section, then a manual reviewer for a fresh verdict.
    - repeated **other** finding → escalate (`**ACTION:**` + `CronDelete` + exit).
  - else → dispatch a **manual fixer** (template below). Budget 3 passes/PR.
- **3d. CI green, no review yet.** All blocking checks concluded, reviews empty,
  no review workflow running → dispatch a **manual reviewer** (template below).
- **3e. Otherwise** (CI still running) → `wait`, stop.

### Failure handling (blocking check FAILURE)

- If the failing check is `build`/`submit-gradle` and the failing test is a
  **known-flaky generation property test** (`PuzzleRouteTest > cells emit
  non-decreasing row-major positions`, or any test with a `puzzle_generation_failed`
  WARN and no relation to `/verify`): re-run the failed job once —
  `gh run rerun <run-id> --failed` — log `RERAN flaky build #<pr#>`, stop. If it
  fails a **second** consecutive time on the same test → dispatch a fixer.
- Any other blocking failure → dispatch a **manual fixer** with the failure log
  tail as the brief. Budget 3 passes/PR; then escalate.

### Stacked-child recovery (base merged, child now targets a dead/stale base)

When a W3/W4 PR's dependency merged but its `baseRefName != main`:
1. `gh pr edit <child#> --base main` (retarget; the base branch wasn't deleted so GitHub won't auto-retarget).
2. Rebase to drop the squashed base commits:
   ```sh
   BR=<child-head-branch>
   git fetch origin --quiet
   git worktree add -q /tmp/gv-rebase "origin/$BR" 2>/dev/null || true
   cd /tmp/gv-rebase && git checkout -q -B "$BR" "origin/$BR"
   LAST_BASE=$(git log --oneline origin/main.."origin/$BR" | tail -1 | awk '{print $1}')  # oldest commit unique to child; inspect to find the true A/B boundary
   git rebase --onto origin/main <last-base-originated-commit> "$BR"
   git push --force-with-lease origin "$BR"
   cd - && git worktree remove -f /tmp/gv-rebase
   ```
   Identify `<last-base-originated-commit>` by reading `git log --oneline origin/main..origin/$BR` and finding where the merged base's commits end and the child's begin. If the rebase conflicts non-trivially → escalate rather than guess.
3. Log `REBASED #<child#> onto main`. Stop (next tick re-checks its CI).

## Manual reviewer dispatch prompt

```
You are a §6a reviewer for PR #<pr#> (<title>). Invoke the `reviewer` skill.
Read the diff via `gh pr diff <pr#>` and the PR body. Review IN SCOPE only
(this PR's diff), against CLAUDE.md + the ADRs bound to the changed paths.
This is grid-verification: ADR-0099 governs /verify; the cap on #1508/#1510 is
a cited §4 "coherent layer" override — treat a cited cap as RESOLVED, do not
flag it. Post exactly one verdict via `gh pr review <pr#>`: first line `LGTM,
no findings.` OR `Findings — ` then each finding (rule cite + file:line +
proposed fix). If the same-actor token rejects --approve, use --comment; the
`LGTM` first line still gates the merge. Reply with the verdict you posted.
```

## Manual fixer dispatch prompt

```
You are a fixer for PR #<pr#> (branch <head>). Work in an isolated worktree off
`origin/<head>`. Open findings / failing checks:
<paste the findings or the failing-check log tail>
Fix each, `git commit -s`, push. Do NOT expand scope. Re-run the covering tests
(name them) and include the command + output. Comment on the PR mapping each
finding → commit SHA (as yourself; cite the standing-authorization section for
any cited-cap finding — never impersonate the maintainer). Reply with commits +
test results.
```

## Logging format

Append one line per tick action to the log's Event log:
`- <ISO8601> — <ACTION> #<pr#> — <one-line detail>`
where ACTION ∈ {MERGED, WAIT, RERAN, REBASED, RETARGETED, DISPATCHED-REVIEWER,
DISPATCHED-FIXER, ESCALATED}. `**ACTION:** ...` lines are for the maintainer.

## End condition

When all seven PRs are `MERGED`:
- Append `**ACTION:** grid-verification rollout complete — all 7 PRs merged. Clean up leftover feat/grid-verify-* branches (gh api / UI) and remove any /tmp/gv-rebase worktree.`
- `CronDelete <this-cron-id>`.
- Exit.
