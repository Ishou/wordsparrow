# ADR-0115: Signalement self-flag (`mine`) and maintainer history queue

## Status

Accepted (amends ADR-0103)

## Context

The `survey/api/openapi.yaml` schema barrier PR for the signalements triage
views feature adds two surfaces to the ADR-0103 maintainer queue:

1. `SignalementSummary.mine: boolean` — true when the authenticated
   maintainer viewing the pending queue is among a group's reporters, so
   they can deprioritize their own reports.
2. `GET /v1/signalements/historique` — a maintainer-only list of
   already-triaged reports.

Neither is decided by ADR-0103. Its Decision section enumerates exactly
three endpoints — `POST /v1/signalements`, `GET /v1/signalements`,
`POST /v1/signalements/{reportId}/decision` — and says nothing about a
self-report signal or a triaged-history view. Both are new product
decisions (a self-triage bias affordance; a new maintainer surface exposing
historical triage outcomes), so per CLAUDE.md ("ADR before non-trivial
change… a contract change spanning contexts… ADR merges first,
ADR-0001 §7") they need a decision record of their own before the schema
that carries them merges.

## Decision

### `mine` — self-report deprioritization signal

- Computed server-side per request: true when the requesting maintainer's
  identity-sourced user id is among the `reporter_id`s of the reports in
  that pending group, false otherwise.
- Purpose: a maintainer who is also a player can recognize and deprioritize
  groups they reported themselves, without a separate query.
- RGPD interaction: `mine` reads `reporter_id`, the same column ADR-0103's
  `UserDeletedConsumer` amendment nulls on account deletion. A null
  `reporter_id` can never equal an authenticated maintainer id, so
  anonymous and RGPD-anonymized reports always evaluate `mine: false` — no
  special-casing needed at read time; the existing anonymization already
  produces the correct answer.
- No new persistence: `mine` is derived at read time from the existing
  `player_reports.reporter_id` column (ADR-0103) — no new column or index.

### `/v1/signalements/historique` — maintainer history queue

- `contribuer`-gated (ADR-0079), same as the existing `/v1/signalements`
  queue and its decision endpoint.
- Scope: already-triaged reports only (`decision` = `dismiss` or `action`),
  ordered newest-triaged-first (`triagedAt` descending).
- Flat list, not grouped: unlike the pending queue's clue+reason grouping
  (which exists because a decision acts on the whole group), a historique
  item is a single already-decided report — there is no group action to
  fan out to.
- Capped server-side at the 200 most-recently-triaged reports; no
  pagination in v1. This is an advisory/audit convenience, not a working
  queue — a maintainer checking "what did I just decide" needs a recent
  window, not full history. Revisit with pagination if usage shows the cap
  is hit routinely.

## Consequences

- **Easier:** a maintainer recognizes their own pending reports at a
  glance and can audit recent triage decisions without a database query.
- **Harder / watch-outs:** the 200-item cap on `/historique` means old
  triage decisions become unreachable via the API — there is no
  reporting/export surface today, so this is a live-queue convenience, not
  a durable audit log. If compliance/audit later needs durable history,
  that's a new ADR, not an extension of this cap.
- No new database column, index, or migration: both additions are
  read-time computations/queries over the existing `player_reports` table
  shape from ADR-0103.
