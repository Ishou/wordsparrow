# Blocklist Word + Regeneration — Orchestration Log

Append-only log of orchestrator decisions during the Wave 3 rollout.

## Standing decisions

| Decision | Value | Rationale |
|---|---|---|
| Merge authority | Orchestrator merges on §6a LGTM + green blocking CI | Maintainer in-session grant 2026-07-12 |
| Polling cadence | 120 s (`*/2 * * * *`) | Repo convention |
| Continuity | Session-only cron; recreate if session ends | Tool behavior |
| Fix-cycle budget per phase | 3 | dispatch-skill default |
| 400-line cap | Soft; orchestrator may invoke §4 override proactively | Standing cap-override grant |
| Phase order | Strictly sequential P1→P5 | Plan |
| Progress policy | Rely on ADR-0105; no server-side orphan cleanup | ADR-0110 §3, maintainer-approved |
| Scrub scope | All affected grids incl. archive (dailies regen, solo delete) | Maintainer decision 2026-07-12 |

## Pre-orchestration state

- Follows the merged ADR-0108 rollout (PRs #1557/#1558/#1559/#1560/#1562/#1566).
- P1 branch worktree: `.claude/worktrees/bw-adr-blocklist` (remove after P1 merges).
- No stashes created by this session.

## Event log

- 2026-07-12 · P1 · OPENED · ADR-0110 + spec + plan + procedure (docs-only, DCO-signed)
