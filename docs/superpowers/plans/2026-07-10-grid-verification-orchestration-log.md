# Grid Verification — Orchestration Log

Append-only log of the cron's merge-chain decisions. For maintainer review.

## Standing decisions

| Decision | Value | Rationale |
|---|---|---|
| Merge authority | Orchestrator merges each PR on green + LGTM | Maintainer grant 2026-07-10: "cron the pr and chain the waves" |
| Merge method | `gh pr merge <pr#> --squash` (no `--delete-branch`) | Repo uses squash; `--delete-branch` collides with agent worktrees on `main` |
| Cap override | §4 2026-05-25 soft-target, proactive | #1508 (512) + #1510 (617) cite "coherent layer" in body |
| Polling cadence | 120 s (`*/2 * * * *`) | dispatch-skill default |
| Fix-cycle budget | 3 per PR | dispatch-skill default |
| Flaky-test policy | re-run once, then fix | `PuzzleRouteTest > cells emit non-decreasing row-major positions` is a generation property test, unrelated to /verify |
| Escalation | 3 failed fix cycles, or identical non-cap finding twice, or non-trivial rebase conflict → log ACTION + CronDelete self | 3c-loop-terminator |

## Merge order (dependency)

`#1505 → {#1506, #1508}` ; `#1508 → #1509` ; `#1506 → #1510 → #1511` ; `#1504` free.

## Pre-orchestration state (2026-07-10)

- All 7 PRs open, implementation complete + spot-reviewed by the dispatcher.
- #1505 (ADR), #1506 (schema), #1508 (backend logic), #1504 (docs), #1511 all CLEAN/MERGEABLE at setup; §6a verdicts on the newer PRs (#1508–#1511) not all posted yet.
- #1509 (backend wiring) had a flaky `build` failure (`PuzzleRouteTest > cells emit non-decreasing row-major positions`, a generation property test) — failed job re-run requested at setup.
- #1510 mergeability still `UNKNOWN` (GitHub computing; new PR).
- Note: schema branch had a stale bot-copied ADR-0099 stripped by the dispatcher so #1505 (canonical ADR) must merge before #1506. The §6a bot also usefully retyped the 429 as `VerifyCooldownProblem`.
- MERGES require an allowlist for `gh pr merge` in `.claude/settings.local.json`; the auto-mode classifier otherwise blocks the merge as unapproved.

## Event log

- 2026-07-10 — SETUP — procedure + log committed; **cron de7b492e** created (`*/2 * * * *`, session-only, 7-day expiry); #1509 flaky build re-run requested.
- 2026-07-10T05:48Z — MERGED #1505 — ADR-0099 (green + final review LGTM after last commit); main → b891df47. Merge authorized in cron context (no classifier block). W2 (#1506, #1508) now unblocked.
- 2026-07-10T05:5xZ — MERGED #1504 — spec+plan docs (green + LGTM); main → 228fc51f. #1506/#1508 mergeability recomputing (UNKNOWN) post-#1505 merge — next tick.
- 2026-07-10T05:5xZ — MERGED #1506 — /verify schema + types (green + LGTM); main → 7217de16. NEXT: #1510 (base feat/grid-verify-schema) needs retarget→main + rebase. #1508 next for W2.
- 2026-07-10T06:0xZ — MERGED #1508 — backend logic (green + LGTM; stale "ADR-0099 not merged" finding resolved by #1505); main → 4f24cd43. PENDING REBASES: #1509 (base feat/grid-verify-logic, now merged) + #1510 (auto-retargeted to main, CONFLICTING). Next tick: rebase one.
