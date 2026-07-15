# Design: "dont vous" badge + Historique tab for `/signalements`

Date: 2026-07-15
Bounded context: `survey/` (producer) + `frontend/` (consumer)
Governing ADRs: 0079 (contribuer gate), 0103 (player reports / RGPD), 0056
(survey context), 0003 (cross-language / schema-first API), 0111 (server-resolved
answer word).

## Problem

The `/signalements` maintainer triage queue (admin-gated, ADR-0079/0103) shows one
flat list of pending report groups. The maintainer wants two things:

1. **See which pending groups include a report they filed themselves**, so they can
   prioritise other people's reports over their own.
2. **A second tab for already-handled (past) reports**, so the current queue only
   shows outstanding work — mirroring the `/grilles` tabbed behaviour.

## Constraints & existing facts (verified against `origin/main`)

- A report (`PlayerReport`) already carries `reporterId: UserId?` (null for anon and
  for RGPD-anonymised rows) and a `status` (`PENDING` / `DISMISSED` / `ACTIONED`)
  with `triagedAt` / `triagedBy`. **No new DB columns are needed.**
- The queue groups pending reports by `(clueText, puzzleId, reason)`
  (`ListSignalementsUseCase`). An authed user can file at most one report per
  `clue + puzzle` (`findExisting` dedup), so a group of `N` ≈ `N` distinct reporters.
- The GET `/v1/signalements` route runs `requireContribuer()`; after that gate
  `call.attributes[UserIdKey]` is guaranteed set (`SessionMiddleware`), so the
  caller's identity is available to compute "from me".
- Deciding a group currently marks only the group's **latest** report
  (`DecideSignalementUseCase` acts on one `reportId`); the rest of the group stays
  `PENDING`. This is a pre-existing quirk and is **out of scope** here. It does mean
  handled rows are effectively per-report, which the flat history list matches
  naturally.
- The `/signalements` route is a single admin-gated, **noindex** lazy route. Unlike
  `/grilles` (which splits one route per tab so the prerender bakes a per-tab
  skeleton), a 404-gated page needs no per-tab prerender, so tabs here use
  in-component state, not separate routes.
- `SegmentedControl` (`frontend/src/ui/v2/SegmentedControl.tsx`,
  `role="tablist"`) is the reusable tab control `/grilles` uses.
- Contract file: `survey/api/openapi.yaml`; frontend survey types are regenerated
  from it (`pnpm api:check`). API path segments are French on this surface
  (`/v1/signalements`, `.../decision`).

## Decisions (from brainstorming)

- **Badge = "includes mine":** badge a group when the caller is among its reporters,
  even if others also reported it. Badge label **`dont vous`**.
- **Ordering unchanged:** keep harm-first, then recency. The badge is the only
  prioritisation aid — own-only groups are **not** reordered.
- **Handled tab = flat list, newest-triaged first**, capped at a recent window
  (100). Not grouped (a group's decisions can be mixed over time).
- **French user-facing surface:** tab labels **À traiter** / **Historique**;
  new API path **`GET /v1/signalements/historique`** (not `handled`); internal tab
  ids `a-traiter` / `historique`.

## Feature A — "dont vous" badge on the pending queue

### Backend (`survey/`)

- `ListSignalementsUseCase.execute(viewerId: UserId)` — thread the caller id in.
  Add `mine: Boolean` to `SignalementGroup`, computed as
  `group.any { it.reporterId?.value == viewerId.value }`. Anonymised/anon reports
  (null `reporterId`) never match.
- `SignalementQueueRoute` GET — after `requireContribuer()`, read
  `UserId(call.attributes[UserIdKey])` and pass it to `list`.
- DTO `SignalementSummary` and the OpenAPI `SignalementSummary` schema gain
  `mine: boolean` (required).

### Frontend

- `SignalementSummary` application type gains `mine: boolean`.
- `SignalementQueue` renders a small **`dont vous`** badge in the row meta when
  `s.mine`. New i18n key `route.signalements.mineBadge`.

### Tests (TDD, write first)

- `ListSignalementsUseCaseTest`: `mine` true when a group contains the viewer's
  report; false for a group of only-other reporters; false for anon/null-reporter
  rows; stays true in a mixed group.

## Feature B — Historique tab

### Backend (`survey/`)

- `SignalementRepository.listHandled(limit: Int): List<PlayerReport>` →
  `SELECT * FROM player_reports WHERE status <> 'pending' ORDER BY triaged_at DESC
  LIMIT ?`.
- `ListHandledSignalementsUseCase` → maps each `PlayerReport` to a history item;
  `decision` derived from status (`ACTIONED` → `action`, `DISMISSED` → `dismiss`).
- New route `GET /v1/signalements/historique`, gated on `requireContribuer()`.
- OpenAPI: new path + `SignalementHistoryItem` schema
  (`reportId, wordText?, clueText, reason, surface?, puzzleId?, note?, decision,
  triagedAt`) + a `SignalementHistoryResponse` list wrapper. `decision` is an enum
  `[action, dismiss]`; `triagedAt` is a `date-time` string.

### Frontend

- Tabbed shell in the `/signalements` lazy screen using `SegmentedControl`
  (`role="tablist"`), ids `a-traiter` / `historique`, labels **À traiter** /
  **Historique**, in-component state (no new routes).
- `SurveyClient.listHandledSignalements(): Promise<ReadonlyArray<SignalementHistoryItem>>`
  and the `SignalementHistoryItem` type.
- New `SignalementHistory` component rendering the flat list: word/clue, reason ·
  surface, a decision chip (**traité** for `action`, **rejeté** for `dismiss`), and
  the triaged date (reuse existing FR date formatting — confirm the exact helper,
  e.g. `longDateFr`, at implementation). Own loading / empty / error states
  mirroring `SignalementQueue`.
- New i18n keys: tab labels + tabs aria, decision chip labels, handled empty state.

### Tests (TDD, write first)

- `PgSignalementRepositoryTest`: `listHandled` returns only non-pending rows,
  newest `triaged_at` first, respects the limit.
- `ListHandledSignalementsUseCaseTest`: status → decision mapping; ordering pass-through.
- Frontend: history component renders decision chips and empty state; tab switch
  shows the right panel.

## Out of scope

- The "decide only marks the group's latest report" quirk (`DecideSignalementUseCase`).
- A `mine` flag on history rows — history is read-back only.
- Reordering / deprioritising own-only groups (explicitly declined: badge only).

## PR decomposition (schema-first, ADR-0003)

1. **Schema-only PR** — both OpenAPI edits (`mine` on `SignalementSummary`; new
   `/v1/signalements/historique` path + history schemas) + regenerated survey types.
   Gates: `openapi-lint`, `openapi-typescript-drift`.
2. **Survey backend PR(s)** — repo method, use cases, route wiring, DTOs, tests.
   Feature A and B backends are both small and may share one PR if under the
   400-line cap; split otherwise.
3. **Frontend PR(s)** — client method, tabbed screen, badge, history component,
   i18n. Split per feature if the combined diff exceeds the 400-line cap.
