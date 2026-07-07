# Multiplayer Ownership Lease — Orchestration Log

Append-only log of decisions the orchestrator made during this rollout. For human review.

## Standing decisions

| Decision | Value | Rationale |
|---|---|---|
| Merge authority | Orchestrator merges on §6a LGTM + all blocking CI green | Maintainer in-session grant "usual pr cron" (2026-07-07) |
| Polling cadence | 120 s (`*/2 * * * *` CronCreate) | Dispatch-skill default |
| Continuity | `CronCreate` (session-only in practice; durable flag ignored by runtime) | — |
| Fix-cycle budget per phase | 3 | Dispatch-skill default |
| Phase order | Sequential per phase map (T4→T5→T6→T7→T8); T2/T3 merge first | Dependency graph in the procedure file |
| Escalation trigger | 3 failed fix-cycles, or 3c-loop-terminator on a non-cap finding, or a CLOSED-not-merged PR | Stops chain; logs ACTION; `CronDelete` self |
| Merge command | `gh pr merge <pr#> --squash` (no `--delete-branch`) | Worktree-collision caveat |

## Pre-orchestration state

- ADR-0098 spec merged to `main` (PR #1439).
- The rollout **plan** (`2026-07-07-multiplayer-ownership-lease.md`), this **procedure**, and this **log** are committed to `main` via the orchestration docs PR (so cron ticks can read them).
- Wave 1 PRs open at bootstrap: **#1440** (T3 domain — §6a LGTM + all green, ready to merge) and **#1441** (T2 schema — blocking checks green, §6a verdict pending at bootstrap).
- Leftover finished-agent worktrees under `.claude/worktrees/agent-*` (Task 3 re-dispatch, Task 2) — harmless; `git worktree remove -f -f` to reclaim if needed.
- Note: `pnpm api:check` shows a pre-existing `billing/types.ts` drift on `main` (stale vs `billing/api/openapi.yaml`) — unrelated to this rollout, outside the `regen-and-diff` gate's file set; flagged for a separate billing-scoped fix, not handled here.

## Event log

- 2026-07-07 · BOOTSTRAP · orchestration procedure + log + plan committed; cron armed; Wave 1 (#1440 T3, #1441 T2) awaiting first tick (merge on LGTM+green, then dispatch T4).
