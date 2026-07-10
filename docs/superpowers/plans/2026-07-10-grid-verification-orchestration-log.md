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
- 2026-07-10T06:0xZ — REBASED #1509 onto main (recovered). First rebase attempt force-pushed a STALE LOCAL feat/grid-verify-wiring (8320a099, checked out in the fix+never-subscribed-status-none worktree) which TRUNCATED origin, dropping commits 603b21f4 + 06006aa6. Recovered from local objects: detached-HEAD rebase from true tip 06006aa6, `--onto origin/main e7f38dcf`, lease-guarded force-push. Result c8a4c069 (3 commits: 19808b97/f651b105/c8a4c069), grid-api/infra only, no dup logic. #1509 now MERGEABLE, CI re-running.
- **ACTION (root cause + mitigation):** a stale local branch shadowed origin during rebase. FUTURE stacked rebases (#1510, #1511) MUST use `git worktree add --detach <sha>` + explicit `HEAD:refs/heads/<branch>` refspec with `--force-with-lease=refs/heads/<branch>:<expected-origin-sha>` — never `git checkout -B <branch>` (it collides with the fix+ worktree's checkout) and never push a bare branch name.
- 2026-07-10T06:1xZ — WAIT #1509 (build re-running after rebase, mergeability UNKNOWN) ; REBASED #1510 onto main — dropped schema-branch history (incl. stripped stale ADR d68c5ce8) via detached rebase --onto main c42644f6; single commit c8bd9807, frontend-only, clean, lease matched (no truncation — detached method worked). #1510 CI re-running. #1511 base still feat/grid-verify-fe-core (rebased) — will need its own rebase after #1510 merges.
- 2026-07-10T06:xxZ — MERGED #1509 — backend wiring (blocking all pass; §6a LGTM on current head c8a4c069 after rebase; only informational Analyze pending); main → 33cb2326. Backend /verify fully live. Remaining: #1510 (CI running), #1511 (CONFLICTING, rebase after #1510 merges).
- 2026-07-10T06:xxZ — MERGED #1510 — frontend capability (blocking pass, LGTM on head c8bd9807); main → 63c76e6e. Last PR: #1511 (base feat/grid-verify-fe-core now merged) — needs retarget→main + rebase next tick.
- 2026-07-10T06:xxZ — REBASED #1511 onto main — detached rebase --onto main 546aeebe dropped #1510's capability commit + schema history; 2 commits (3de9d295 activate, 82cb548f comment-fix), clean, no conflict, lease matched. #1511 CI re-running; merges next tick when green. LAST PR.
- 2026-07-10T06:xxZ — MERGED #1511 — activate Vérifier (blocking pass, LGTM on head 82cb548f); main → ba949dc6.
- **ACTION:** ROLLOUT COMPLETE — all 7 PRs merged (#1505 ADR, #1504 docs, #1506 schema, #1508 be-logic, #1509 be-wiring, #1510 fe-core, #1511 fe-wire). Grid verification (Vérifier) fully on main, replacing solo hints. Deleting merged feat/grid-verify-* + docs/grid-verification-* branches and CronDelete de7b492e. Kept branch worktree-feat+grid-verification (holds this procedure+log, not on main). Note: pre-existing billing/types.ts drift on main remains (separate chore).
