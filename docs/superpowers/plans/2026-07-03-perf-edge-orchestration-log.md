# Perf edge-caching rollout — Orchestration Log

Append-only log of decisions the orchestrator made during this rollout. For human
review when convenient.

## Standing decisions

| Decision | Value | Rationale |
|---|---|---|
| Merge authority | Orchestrator merges on latest bot-review LGTM + green blocking checks + CLEAN merge state | Maintainer approved plan + dispatch in-session 2026-07-03 ("go"); auto-merge cron is the standing default |
| Polling cadence | 120 s (`*/2 * * * *` CronCreate) | Matches prior rollouts |
| Continuity | CronCreate, session-scoped | Maintainer interactive today; re-bootstrap via /orchestrate if session ends mid-rollout |
| Fix-cycle budget per phase | 3 | Dispatch-skill default |
| Phase order | Waves per plan: 0→1→(2,3,4,5 parallel)→6→7→8→(9,10) | Plan "Wave" sections |
| Cap pre-flag | Phase 8 cites §4 soft-target override from first push | Standing 2026-05-22/25 grant; short-circuits the 3c loop |
| Escalation trigger | 3 failed fix-cycles, repeated identical non-cap finding, or CLOSED PR | Stops cron; ACTION entry for maintainer |

## Pre-orchestration state

- Bootstrap authored from worktree `perf-query-timings-analysis` (analysis-only; no code
  changes). Plan deviation noted: plan's PR 1 said "bundle spec docs"; the analysis +
  plan docs ship in this Phase-0 PR instead so the cron and implementers can read them
  from origin before the ADR merges. Wave-1 PR is ADR-0089 + INDEX.md only.
- Deferred issues (plan "Issues to file") are Phase 10, filed by the orchestrator.
- No stashes created. Main checkout untouched.

## Event log

(entries appended chronologically by the cron)
