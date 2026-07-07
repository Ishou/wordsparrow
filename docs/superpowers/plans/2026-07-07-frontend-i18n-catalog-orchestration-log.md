# Frontend i18n Copy Catalog — Orchestration Log

Append-only log of decisions the orchestrator made during this rollout. For human review when convenient.

## Standing decisions

| Decision | Value | Rationale |
|---|---|---|
| Merge authority | Orchestrator merges on §6a LGTM + green blocking CI | In-session grant "Authorize me to merge" + "usual cron is allowed" (2026-07-07) |
| Polling cadence | 120 s (`*/2 * * * *` CronCreate) | Dispatch-skill default |
| Continuity | `CronCreate` (session-only in practice; durable flag ignored by runtime) | Dispatch-skill note |
| Fix-cycle budget per phase | 3 | Dispatch-skill default |
| Phase order | Strictly sequential: P1 design-system → P2 play → P3 auth+lobby → P4 shell+brand → P5 v2 → P6 routes+seo+app | design-system copy lifted to props before its consumers render it |
| 400-line target | Split-first; no proactive-override grant this rollout → escalate rather than bypass without a grant | Only "usual cron"/merge grants given, not a cap-override grant |
| Escalation trigger | 3 failed fix-cycles, or identical-finding loop, or CLOSED-not-merged PR | Dispatch-skill §3c |

## Pre-orchestration state

- Foundation shipped: PR #1449 (i18n module + `t()` accessor + `ui/home` pilot + dev-mode unresolved-placeholder guard) MERGED to `main` 2026-07-07.
- The design spec + foundation plan + this rollout's full SDD history are preserved on the LOCAL branch `i18n-foundation-with-docs` (not pushed; kept out of the code PR per repo doc-placement norms). The orchestration procedure is self-contained — it does not depend on those docs being on origin.
- Local `.superpowers/sdd/` scratch (ledger, briefs, reports) is git-ignored and unrelated to the cron.
- No relevant stashes owned by this rollout.

## Event log

(entries appended chronologically by the cron)

- 2026-07-07 · BOOTSTRAP · orchestration procedure + log authored; foundation #1449 merged; P1 (design-system) is the first phase to dispatch on the next tick.
- 2026-07-07 · P1 design-system · DISPATCHED · implementer agent in worktree, branch refactor/i18n-design-system (copy-agnostic props + consumer ripple; split into P1a/P1b if over target)
