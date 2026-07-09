# Mobile Shell Resilience — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the AppShell mobile-resilience multi-PR rollout.

**Cron schedule:** `*/2 * * * *` (every 2 minutes; auto-expires after 7 days; recreate if the rollout exceeds 7 days).

**CWD:** run from the repo root (`cd "$(git rev-parse --show-toplevel)"`).

**Spec:** `docs/superpowers/specs/2026-07-09-mobile-shell-resilience-design.md`
**Plan:** `docs/superpowers/plans/2026-07-09-mobile-shell-resilience.md` (per-task detail; the implementer reads its own phase's tasks in full).
**State source of truth:** `docs/superpowers/plans/2026-07-09-mobile-shell-resilience-orchestration-log.md`.

## Standing maintainer authorization (recorded 2026-07-09)

Granted in-session by the maintainer (Ishou), the sole repo owner:

- **Merge authority:** the orchestrator merges a PR itself once every blocking
  check is green AND the §6a reviewer verdict is `LGTM` (case-insensitive first
  line). No per-merge confirmation required.
- **Full autonomy through all phases:** the maintainer chose to review the whole
  rollout on-device **after** it completes rather than gate between PRs. The
  orchestrator does **NOT** halt between Phase 1 → 2 → 3 for on-device
  confirmation. **Recorded risk:** the target bug (mobile-PWA phantom scrollbar)
  is not reproducible in CI, so no gate mechanically verifies the fix mid-rollout;
  the maintainer's post-rollout on-device pass is the sole functional verification.
  This is the maintainer's explicit choice.
- **400-line soft target (ADR-0001 §4, 2026-05-25 amendment):** the orchestrator
  MAY invoke the soft-target override proactively — without escalating — when a
  coherent workstream exceeds 400 lines. Each implementer still asks "should this
  split?" first; override is the exception. When invoked, the PR body cites the §4
  2026-05-25 soft-target amendment and this section; the §6a reviewer treats that
  citation as resolved, and re-flagging it triggers the 3c-loop-terminator.
  **Phase 1 is pre-flagged cap-heavy** (lock + primitive + two tests + shim): its
  implementer cites the override from the first push.

## Phase map

Strictly sequential. Phase 0 (ADR) MUST land before Phase 1 (ADR-0001 §7). Every
phase after Phase 1 depends on `frontend/src/ui/v2/AppShell.tsx` being on `main`.
Phase 5 deletes `PhoneShell.tsx` and therefore MUST be the last content phase
(all call sites migrated by then).

| Phase | Branch | Base | PR title | Plan tasks | Depends on |
|---|---|---|---|---|---|
| 0 | `docs/adr-0054-app-shell` | `main` | `docs(adr-0054): amend page-shell primitive with AppShell contract; move misfiled amendment off ADR-0072` | Task 1 (re-targeted to ADR-0054) **+ revert the misfiled AppShell amendment that PR #1493 merged into ADR-0072** | — |
| 1 | `feat/frontend-app-shell` | `main` | `feat(frontend-ui): resilient AppShell primitive + document scroll lock` | Tasks 2–5 | Phase 0 merged |
| 2 | `refactor/frontend-grid-app-shell` | `main` | `refactor(frontend-ui): grid pages use AppShell overlay` | Tasks 6–7 | Phase 1 merged |
| 3 | `refactor/frontend-home-app-shell` | `main` | `refactor(frontend-ui): HomeScreen uses AppShell flow` | Task 8 | Phase 1 merged |
| 4 | `refactor/frontend-appshell-routes` | `main` | `refactor(frontend-ui): migrate routes + salon screens to AppShell` | Task 9 (routes/ + `v2/multiplayer/SalonScreen`) | Phase 1 merged |
| 5 | `refactor/frontend-appshell-v2` | `main` | `refactor(frontend-ui): migrate v2 screens to AppShell; remove PhoneShell` | Task 9 (`v2/*` + delete PhoneShell) | Phase 4 merged |

**Scope note per phase:** the implementer reads *only its own phase's tasks* in
`docs/superpowers/plans/2026-07-09-mobile-shell-resilience.md` and touches only the
files those tasks name. Phase 1 carries the §4 override pre-flag.

## Tick procedure

Take **at most one action per tick**, then stop.

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Load this procedure. If it is not on `origin/main` yet, read it from the
   holding branch: `git show origin/docs/mobile-shell-resilience:docs/superpowers/plans/2026-07-09-mobile-shell-resilience-orchestration-procedure.md`.
3. Walk the phase map top-to-bottom. For the first phase not yet MERGED, find its
   PR (search open+closed PRs whose head branch matches the phase branch):
   - **MERGED** → move to the next phase (continue the walk).
   - **CLOSED, not merged** → escalate: append an `ACTION` log entry and
     `CronDelete` self, then exit.
   - **OPEN** → apply the open-PR decision tree below.
   - **No PR yet AND the previous phase is MERGED (or this is Phase 0)** →
     dispatch the implementer agent for this phase (template below). Log
     `dispatched`.
4. If the phase to dispatch depends on a not-yet-merged prior phase, wait (no
   action) — the prior phase is still in flight.

### Open-PR decision tree

Apply top-down; act on the first match:

- **3a. Ready to merge.** All blocking checks `SUCCESS` (`ci` / `build` /
  `frontend-build`, `commitlint`, `branch-name`, `dco`, `gitleaks`,
  `dependency-review`, `regen-and-diff` / `openapi-typescript-drift`,
  `spectral` / `openapi-lint`, `helm-lint`, `api-chart-lint`,
  `readme-diagrams-drift`) AND `mergeable: MERGEABLE` AND
  `mergeStateStatus != BLOCKED` AND one of: latest review body starts with
  `LGTM` **OR** the only outstanding finding is the 400-line target and the PR
  body cites the §4 soft-target override **OR** the 3c-loop-terminator fired with
  an effectively-resolved verdict. → `gh pr merge <pr#> --squash` (NO
  `--delete-branch` — it collides with agent worktrees holding `main`). Log
  `merged`.
- **3b. Auto-loop alive.** `claude-review` is `IN_PROGRESS`/`QUEUED`, or a
  `Claude Code Review` run is active on the branch within the last 15 min. → wait.
- **3c. Findings + no fixer activity.** Latest review starts with `Findings —`,
  no `claude-review` run active on the branch, no commit since the review
  timestamp.
  - **3c-loop-terminator:** before dispatching a fixer, compare the latest
    review's first finding to the prior §6a review's first finding (rule-citation
    + location + fix-shape). If essentially identical AND the diff materially
    changed between reviews:
    - repeated finding is the **400-line target** → dispatch a body-edit fixer
      that cites the §4 override + the standing-authorization section, then
      dispatch a manual reviewer for a fresh verdict.
    - repeated finding is **anything else** → escalate (ACTION log +
      `CronDelete` self + exit).
  - Otherwise → dispatch a manual fixer (template below). Log `fixer-dispatched`.
- **3d. CI complete + no review yet.** All blocking checks concluded, reviews
  list empty, no `claude-review` run active. → dispatch a manual reviewer
  (template below). Log `reviewer-dispatched`.
- **3e. CI still running.** Otherwise → wait.

**Informational checks (NEVER block merge):** `claude-review` itself,
`CodeQL` / `Analyze (java-kotlin)`, Cloudflare Pages `deploy` preview.

## Implementer agent prompt template

Dispatch with `Agent({ subagent_type: "general-purpose", isolation: "worktree", run_in_background: true, description: "Phase <P> · <slug>", prompt: <below> })`.

Before dispatch, the cron runs `scripts/adr-context.sh <every path the phase touches>` and inlines the output under MANDATORY READING. For frontend-only phases this is typically ADR-0002, ADR-0050, ADR-0054 (amended). If the helper emits nothing, write `No path-bound ADRs beyond those named; proceed.`

```
You are an implementation agent. **Phase <P>** of the AppShell mobile-resilience
rollout: <one-paragraph goal from the phase's plan tasks>.

Before you begin, invoke `/frontend` for the conventions and gotchas specific to
frontend/** work.

## Background
Spec: `docs/superpowers/specs/2026-07-09-mobile-shell-resilience-design.md`.
Plan: `docs/superpowers/plans/2026-07-09-mobile-shell-resilience.md` — implement
**Task(s) <N..M>** of that plan in full, step by step. Do only those tasks.
These planning docs may not be on `origin/main` yet. If a file is absent from
your `origin/main` checkout, read it from the holding branch:
`git show origin/docs/mobile-shell-resilience:<path>`. Branch your CODE off
`origin/main` as usual — only the planning docs come from the holding branch.

## MANDATORY READING — binding rules for the paths this PR touches
<inlined scripts/adr-context.sh output>

## Your scope
Exactly the files named in Task(s) <N..M>. DO NOT touch files outside that set.
DO NOT refactor unrelated code. DO NOT add dependencies. DO NOT change md/lg
(tablet/desktop) CSS — carry it over verbatim per the spec.

## How to ship
1. Branch off `origin/main` as `<phase branch>`.
2. Implement the tasks (they are TDD — write the failing test, run it, implement,
   run it green, commit per the plan's step boundaries).
3. Validate: `cd frontend && pnpm typecheck && pnpm test && pnpm e2e --project=chromium && pnpm a11y`.
   For grid/home phases also run `pnpm e2e --project=pixel-7 shell-scroll-invariants`.
4. Commit with `git commit -s`, Conventional Commits, single scope. WIP →
   `chore(frontend): wip ...`.
5. Push `git push -u origin <branch>`; open a PR via
   `mcp__github__create_pull_request` (owner `Ishou`, repo `bliss`, base `main`),
   title `<phase PR title>`, body Why/What/Test-plan referencing this phase and
   the plan.
<IF PHASE 1 ONLY:> This phase is pre-flagged cap-heavy. Cite the ADR-0001 §4
2026-05-25 soft-target override in the PR body FROM THE FIRST PUSH (it bundles the
lock + AppShell primitive + two tests + PhoneShell shim as one coherent
foundation; splitting would create dependent follow-ups). Still note you
considered splitting.

## Comment style
Comments document non-obvious WHY, in one line. Default to no comment. No
multi-paragraph comment blocks in new code (the §6a reviewer flags them and the
auto-fixer cycles collapsing them — pre-empt).

## Constraints
- Conventional commits, DCO sign-off (`git commit -s`). No emojis.
- No cross-context imports. Preserve `<main id="main-content">` + `SkipLink`.
- ADR-0001 §4 400-line soft target; Phase 1 uses the granted override.

## CI auto-fix loop
After pushing, monitor CI and auto-fix until green.
1. Wait ~60s, then poll `mcp__github__pull_request_read` (`get_check_runs`) every
   ~30s until every BLOCKING check terminates. Blocking: build/ci/frontend-build,
   commitlint, branch-name, dco, gitleaks, dependency-review,
   openapi-typescript-drift, readme-diagrams-drift. Informational (don't block):
   claude-review, CodeQL, deploy.
2. On a blocking failure, diagnose + fix. Common: dco → `git commit -s --amend
   --no-edit`; commitlint → single conventional scope; frontend build → reproduce
   `pnpm typecheck && pnpm lint && pnpm test && pnpm build` locally.
3. Budget: 3 fix passes. After 3, STOP and report the blocker.
4. Only report back once all blocking checks are green (or budget exhausted).

## Report back (under 250 words)
Branch + PR number + URL; file inventory + LOC (main vs tests); test/lint/build
outputs; decisions beyond the brief; blockers.
```

## Manual reviewer dispatch prompt

Dispatch when the auto-reviewer hangs (3d, or 3b stuck >15 min).

```
You are a §6a reviewer for PR #<N> in the AppShell mobile-resilience rollout.
Invoke the `reviewer` skill. Review ONLY this PR's diff against ADR-0001 §6a
scope rules. Anchor findings to file/line + a cited rule (CLAUDE.md / an ADR /
the spec at docs/superpowers/specs/2026-07-09-mobile-shell-resilience-design.md).
Focus areas for this rollout: (a) the document lock / single-scroll-container
invariant is preserved; (b) md/lg CSS carried over verbatim (no desktop
regression); (c) `<main id="main-content">` + SkipLink present; (d) no
multi-paragraph comments. Post via `gh pr review`: first line `LGTM, no findings.`
OR `Findings — ...` then one finding per block (rule + file/line + proposed fix).
If the same-actor token rejects `--approve`, use `--comment` with `LGTM` as the
first line. Do not review beyond scope.
```

## Manual fixer dispatch prompt

Dispatch when findings sit with no fixer activity (3c, non-terminator path).

```
You are a fixer for PR #<N> in the AppShell mobile-resilience rollout. Fetch the
open review findings via `mcp__github__pull_request_read` (get_reviews /
get_review_comments). Address each finding with the smallest correct change in a
worktree off the PR branch. Do NOT expand scope. After pushing, reply on the PR
mapping each finding → commit SHA. Budget 3 passes; if a finding recurs
unchanged, stop and report. Re-run `cd frontend && pnpm typecheck && pnpm test`
before pushing.
```

## Logging format

Append to the log file, one line per event:

```
- <ISO-8601-ish tick marker> · Phase <P> · <dispatched|opened|reviewer-dispatched|fixer-dispatched|merged|waiting|ACTION> · PR #<N> · <one-line note>
```

`ACTION` entries flag human intervention needed and are always accompanied by
`CronDelete` + exit.

## End condition

When Phase 5 merges:
- Append `**ACTION:** rollout complete. Maintainer: run the on-device PWA pass
  (phantom scrollbar gone on /, /grilles, /play, a co-op game) across all
  screens; then clean up the phase branches.`
- `CronDelete <cron-id>`.
- Exit.
