# Grid Clue Corrections — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the grid-clue-corrections multi-PR rollout (Waves 1–2).

**Cron schedule:** `*/2 * * * *` (every 2 minutes; auto-expires after 7 days; recreate if the rollout runs longer).

**CWD:** run from repo root (`cd "$(git rev-parse --show-toplevel)"`).

**Repo:** `Ishou/wordsparrow` (all `gh` calls use `--repo Ishou/wordsparrow`).

**Source of truth:** the spec `docs/superpowers/specs/2026-07-12-grid-clue-corrections-design.md`, the plan `docs/superpowers/plans/2026-07-12-grid-clue-corrections.md`, and this file. Until PR #1557 merges, read them from `origin/docs/adr-grid-clue-corrections`.

**State ledger:** `docs/superpowers/plans/2026-07-12-grid-clue-corrections-orchestration-log.md`.

## Standing maintainer authorization (recorded 2026-07-12)

- **Merge authority:** the orchestrator merges a phase PR on green blocking-CI + a §6a LGTM (or the §6a loop-terminator resolution). Granted in-session for this rollout.
- **400-line soft cap:** standing authorization to invoke the ADR-0001 §4 2026-05-25 soft-target override **proactively without escalating**, to short-circuit the 3c-loop-terminator. The cap is a "should this split?" trigger, not a hard limit. Pre-flag it in the PR body from the first push for phases marked cap-heavy (P4).
- **Autonomy:** autonomy on execution; escalate only on genuine blockers (3 failed fix-cycles, a CLOSED-not-merged phase, or an ambiguous product decision).

## Phase map (strictly sequential — dispatch phase N only when phase N-1 is MERGED)

| Phase | Branch | Base | PR title prefix | Scope (see plan section) |
|---|---|---|---|---|
| P1 | `docs/adr-grid-clue-corrections` | `main` | `docs(adr): ADR-0108 grid clue corrections` | ADR + spec + plan + this procedure. PR #1557, OPEN. |
| P2 | `feat/grid-corrections-schema` | `main` | `feat(api-grid): corrections endpoints schema` | Plan PR2. Schema-only `grid/api/openapi.yaml`: `POST /v1/corrections` (202 + correctionId), `GET /v1/corrections/{correctionId}`, `CorrectionRequest` oneOf (replace, forbid_clue), errors 403/409 LAST_CLUE_FORBIDDEN/422. Regenerate `frontend/src/infrastructure/api/grid/types.ts` (`pnpm api:check`) in-PR. |
| P3 | `feat/identity-admin-signalements-cap` | `main` | `feat(identity-domain): admin:signalements capability` | Plan PR3. Add `Capability.ADMIN_SIGNALEMENTS("admin:signalements")`, grant to `Role.MAINTAINER` only; tests. |
| P4 | `feat/grid-corrections-producer` | `main` | `feat(grid): record clue corrections + generation overlay` | Plan PR4. Migration `V10__clue_corrections.sql`; `ClueCorrection` domain (kinds REPLACE, FORBID_CLUE); `CorrectionRepository` + `RecordCorrectionUseCase` (reject last-clue forbid → 409); `PostgresCorrectionRepository`; `CorrectionAwareWordRepository` overlay; ported `SessionMiddleware`+`IdentityClient`+`requireCapability`; `CorrectionRoute` gated on `admin:signalements`; wire in `Module.kt`. **Cap-heavy — split P4a/P4b if needed; invoke §4 override in body from first push.** |
| P5 | `feat/grid-corrections-worker` | `main` | `feat(grid): durable clue-correction backfill worker` | Plan PR5. `ProcessCorrectionsUseCase` + `GridBackfillPort` + `PostgresGridBackfill` (JSONB match/patch, forbid re-pick); worker `--process-corrections` + `--export-corrections`; CronJob chart; resume/idempotency tests. |
| P6 | `feat/frontend-clue-correction` | `main` | `feat(frontend-grid): maintainer clue-correction action` | Plan PR6. `CorrectionForm` (Remplacer / Interdire, tutoiement), `applyCorrection` (grid call → survey `action`), progress poll UI; wire into `SignalementQueue.tsx`; gate `signalements.lazy.tsx` on `admin:signalements`; MSW tests. |

Both operations (replace + forbid-clue) ship within P4/P5/P6 — "Wave 2" is a checklist item, not a separate phase, unless PR size forces replace-first (then add P4'/P6' for forbid).

## Tick procedure

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Load this procedure + the log. If PR #1557 is still open, read procedure/spec/plan from `origin/docs/adr-grid-clue-corrections` via `git show`.
3. Walk the phase map in order. For each phase, find its PR (`gh pr list --repo Ishou/wordsparrow --head <branch> --state all --json number,state,mergeStateStatus,mergeable`):
   - **MERGED** → go to next phase.
   - **CLOSED-not-merged** → escalate (log `**ACTION:**` + `CronDelete` self + stop).
   - **OPEN** → assess via the open-PR decision tree; act on the first match; then stop (one action per tick).
   - **No PR AND previous phase MERGED (or this is P1)** → dispatch this phase's implementer (below); log it; stop.
4. If the last phase (P6) is MERGED → append `**ACTION:** rollout complete; remind maintainer to remove worktrees + note the cron auto-expires`, `CronDelete` self, stop.
5. At most one action per tick.

### Open-PR decision tree (top-down, act on first match)

- **3a. Ready to merge.** All blocking checks SUCCESS (`ci`/build, `commitlint`, `branch-name`, `dco`, `gitleaks`/secret-scan, `dependency-review`, `regen-and-diff`, `spectral`/`openapi-lint`, `helm-lint`, `api-chart-lint`, `registry-coherence`, `readme-diagrams-drift` — whichever are present) AND `mergeable==MERGEABLE` AND `mergeStateStatus != BLOCKED` AND (latest review body starts with `LGTM` case-insensitive OR the only outstanding finding is the 400-line cap AND the body cites the §4 override OR 3c-loop-terminator fired resolved). → `gh pr merge <#> --repo Ishou/wordsparrow --squash` (NO `--delete-branch`). Log MERGED.
- **3b. Auto-loop alive.** `claude-review` check IN_PROGRESS/QUEUED, or a Claude Code Review run active on the branch < 15 min ago. → wait.
- **3c. Findings + no fixer activity.** Latest review starts with `Findings —`, no claude-review run active now, no commit since the review.
  - **3c-loop-terminator:** if this cycle's first finding's rule+location+fix-shape ≈ the prior cycle's first finding AND the diff/body changed since: if it's the 400-line cap → dispatch a body-edit fixer citing the §4 override, then a manual reviewer; else → escalate (`**ACTION:**` + `CronDelete`).
  - Else → dispatch a manual fixer (template below). Budget 3 fix-cycles/phase.
- **3d. CI done, no review yet.** All blocking checks concluded, reviews empty, no claude-review run active. → dispatch a manual reviewer (template below).
- **3e. CI still running.** → wait.

Informational checks (NEVER block merge): `claude-review` itself, `CodeQL`/`Analyze (java-kotlin)`, Cloudflare `deploy` preview.

## Implementer agent dispatch

When dispatching phase N, spawn `Agent({ description: "grid-corrections · PN <slug>", subagent_type: "general-purpose", isolation: "worktree", run_in_background: true, prompt: <below> })`.

Build the prompt from this template, filling the phase's row:

```
You are an implementation agent. **Phase P<N> of the grid-clue-corrections rollout** (Ishou/wordsparrow). <one-paragraph goal from the phase map>.

## Background
Spec: docs/superpowers/specs/2026-07-12-grid-clue-corrections-design.md
Plan: docs/superpowers/plans/2026-07-12-grid-clue-corrections.md — read PR<N>'s section in full.
Governing ADR: ADR-0108 (docs/adr/0108-grid-clue-corrections.md).

## MANDATORY READING — read these ADRs in full before writing any code. Binding rules for the paths this PR touches.
<INLINE the stdout of: scripts/adr-context.sh <the phase's touched paths> — run it at dispatch time and paste verbatim. If empty, write "No path-bound ADRs beyond ADR-0108 apply; proceed.">

## Domain skill
Before you begin, invoke /<jvm-backend|frontend|schemas> for this area's conventions and gotchas.

## Your scope
<exact paths + changes from the plan's PR<N> steps. Do the TDD steps in order.>

DO NOT: touch files outside this phase's scope; add new dependencies; refactor unrelated code; edit generated types by hand (regenerate).

## How to ship
1. Branch off origin/main as <phase branch>.
2. Implement (TDD; failing test first).
3. Validate: <gradle module check + spotlessCheck | cd frontend && pnpm typecheck && lint && test && build | spectral lint + pnpm api:check>.
4. `git commit -s` with a Conventional Commit (single scope, no commas; type in feat|fix|chore|refactor|test|docs). Subject lowercase first word after scope. Body lines ≤100 chars. End with:
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
5. `git push -u origin <branch>`.
6. Open the PR via gh (base main, repo Ishou/wordsparrow). Body = Why / What / Test plan; cite ADR-0108 and "Phase P<N>". <For P4: cite the ADR-0001 §4 2026-05-25 soft-target override in the body from the first push.>

## Comment style
Comments document non-obvious WHY, in one line. Default to no comment. No multi-paragraph // or # blocks — if you need more than one line it's ADR-worthy; link ADR-0108 from one line. The §6a reviewer flags this every cycle — pre-empt at write-time.

## Constraints
- ADR-0001 §4 400-line soft target (generated code excluded).
- Conventional commits, DCO sign-off (git commit -s). No emojis. No cross-context imports.
- French copy uses tutoiement ("tu", never "vous").

## CI auto-fix loop
After pushing, monitor CI and auto-fix until green. Blocking: build/ci, commitlint, branch-name, dco, gitleaks, dependency-review, regen-and-diff, spectral/openapi-lint, helm-lint, api-chart-lint, registry-coherence, readme-diagrams-drift. Informational (never block): claude-review, CodeQL/Analyze, deploy. Budget 3 fix passes; then stop and report the blocker. Common: dco→`git commit -s --amend --no-edit`+force-push; commitlint→single scope, lowercase subject; regen-and-diff→`pnpm api:check` commit diff; spectral→fix schema lint.

## Report back (<250 words)
Branch + PR number + URL; file inventory + LOC (main vs tests); test/lint/build outputs; decisions beyond the brief; blockers.
```

Per-phase touched paths for `scripts/adr-context.sh` (run at dispatch, inline output):
- **P2:** `grid/api/openapi.yaml frontend/src/infrastructure/api/grid/types.ts`
- **P3:** `identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt`
- **P4:** `grid/api/src/main/resources/db/migration/V10__clue_corrections.sql grid/domain/src/main/kotlin/com/bliss/grid/domain/correction/ClueCorrection.kt grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CorrectionAwareWordRepository.kt grid/api/src/main/kotlin/com/bliss/grid/api/routes/CorrectionRoute.kt grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt`
- **P5:** `grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/PostgresGridBackfill.kt infra/platform/charts/grid-worker/templates/corrections-cronjob.yaml docs/infra/topology.yaml`
- **P6:** `frontend/src/ui/routes/signalements.lazy.tsx frontend/src/ui/components/signalements/SignalementQueue.tsx frontend/src/application/correction/applyCorrection.ts`

## Manual reviewer dispatch prompt

```
You are a §6a reviewer for PR #<N> (Ishou/wordsparrow), grid-clue-corrections rollout. Invoke /reviewer. Read the diff (gh pr diff <N> --repo Ishou/wordsparrow). Review IN SCOPE only (this PR's diff) against ADR-0108, ADR-0001 §4, ADR-0003, and CLAUDE.md. Post via `gh pr review <N> --repo Ishou/wordsparrow` with first line "LGTM, no findings." OR "Findings — ..." (one finding per block: cited rule + file:line + proposed fix). Same-actor token may force --comment instead of --approve; that's fine — the merge gate matches on the LGTM first line. Do not review out-of-scope pre-existing code.
```

## Manual fixer dispatch prompt

```
You are a fixer for PR #<N> (Ishou/wordsparrow), grid-clue-corrections rollout, branch <branch>. Fetch the open review findings (gh pr view <N> --repo Ishou/wordsparrow --json reviews). In a fresh worktree off <branch>, address each finding (TDD where code changes), `git commit -s`, push. Reply on the PR mapping finding→commit SHA (post as the fixer, never impersonate the maintainer). Budget 3 passes. If a finding is invalid or is the 400-line cap covered by the §4 override, say so with the citation instead of code-changing.
```

## Logging format

Append to the log's Event log, one line per event:
`- <ISO time> · P<N> · <DISPATCHED|OPENED #<pr>|CI-GREEN|REVIEW-LGTM|FINDINGS|FIXER-DISPATCHED|MERGED|ACTION> · <one-line detail>`
