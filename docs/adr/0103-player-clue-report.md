# ADR-0103: Player clue/word report ("Signaler")

## Status
Accepted

## Context

Players hit bad clues and words while playing — an offensive word, a
definition that gives the answer away, a wrong sense, an ambiguous or
mis-levelled clue. Today there is no path for a player to flag any of this
from the play grid; `frontend/src/ui/routes/contribuer.lazy.tsx` even carries
a "No report endpoint yet" note. Clue quality is owned by the `survey/`
bounded context (ADR-0056), which already runs the rating → correctif → gold
training loop, so player reports belong there rather than in `grid/` or
`game/`.

The reporting surface has to serve every place a clue is shown — solo/daily
puzzles, multiplayer lobbies, and the homescreen mini-game — from a single
endpoint, and it has to work for anonymous visitors, since most play is
unauthenticated. That rules out reusing the existing `contribuer`-gated
rating endpoints, which reject anonymous callers by design (ADR-0079).

There is no stable identifier for a clue on the wire: the grid ships a word
and its clue text, not a survey `item_id`, and the clue-cooldown constraint
(`V3__create_clue_cooldown.sql`) keys on `(word, definition)` text rather than
a UUID. A report therefore has to identify what it is about by the same
`(word_text, clue_text)` text pair.

## Decision

Add a player-facing report capture to `survey/`:

- **`POST /v1/signalements` — optional auth.** A single synchronous endpoint
  serves solo/daily, multiplayer, and the mini-game; the caller passes a
  `surface` discriminator. Anonymous and authenticated callers are both
  accepted; a session, when present, binds the report to the reporter for
  per-user dedup and RGPD anonymization. This is a deliberate departure from
  the `contribuer`-gated rating endpoints — capture must be open to maximise
  signal, the way anonymous ratings already are (ADR-0056).
- **`PlayerReport` aggregate + `player_reports` table.** Reports persist via a
  new aggregate (word text, clue text, reason, optional note, optional
  `puzzleId`, surface, optional reporter, status, timestamps). Report ↔ survey
  item matching is a text join on `(word_text, clue_text)`; there is no clue
  UUID to key on.
- **Harm reasons email the maintainer via a new survey Brevo `EmailSender`.**
  Offensive-word / offensive-definition reports send one email to the
  maintainer through a survey-owned Brevo adapter that mirrors the identity
  and billing adapters (ADR-0092 / ADR-0094). We do **not** introduce a shared
  cross-context mailer — each context owns its sender and its own Brevo secret,
  consistent with the no-cross-context-imports rule. The API-5xx SigNoz alert
  posture (ADR-0032) is an alert rule, not application code, and is unchanged.
- **Maintainer triage at `/signalements`, gated on `contribuer`.** The
  maintainer queue (`GET /v1/signalements`) and the decision endpoint
  (`POST /v1/signalements/{reportId}/decision`) require the `contribuer`
  capability (ADR-0079); anonymous and non-maintainer callers receive 403.
- **Accepted reports become correctifs.** "Corriger" routes an accepted report
  into the existing rating/correctif gold loop unchanged — no new training or
  export path is added.
- **RGPD anonymization rides the existing `UserDeletedConsumer`.** On
  `wordsparrow.user.deleted`, a reporter's rows have `reporter_id` nulled
  alongside the existing rating anonymization, matching the ADR-0056 Article-17
  posture.

## Threat Model

Incremental over ADR-0056's STRIDE coverage; only the deltas from the new
endpoints are restated.

- **Spoofing / repudiation.** Optional-auth capture carries no identity claim
  when anonymous, so there is nothing to spoof or repudiate; authenticated
  reports reuse the `__Secure-ws_session` cookie verified by identity-api with
  the existing 30 s cache.
- **Tampering / poisoning (report flooding).** A partial unique index on
  `(reporter_id, word_text, clue_text)` dedups authenticated submissions;
  anonymous reports are bounded by the existing ingress rate limits
  (`limit-rps: 5`, `limit-connections: 30`). Reports are advisory — the
  maintainer triages every one; there is no auto-takedown, so a flood degrades
  queue signal but cannot remove content or alter training data.
- **Information disclosure.** The list/decision endpoints are `contribuer`-gated
  (403 otherwise); the capture endpoint returns only the new `reportId`.
- **Elevation of privilege.** No maintainer surface is reachable without the
  `contribuer` capability sourced from identity's whoami (absent ⇒ deny).

## Amendment — wordText optional; dedup re-keyed on clue+puzzle (2026-07-11)

The original decision required `word_text` and keyed dedup on
`(reporter_id, word_text, clue_text)`. That blocked the most important
report: an offensive definition a player has **not** solved. A player must be
able to flag a clue from the clue alone, so `wordText` becomes optional
end-to-end (present ⇒ non-blank; sent best-effort only when the word is
solved, to help later `survey_item` matching). No server-side word
resolution is added — the solution stays in `grid/` and off the wire
(ADR-0076).

A report is now identified by `clue_text` + `puzzle_id`. The partial unique
index and the maintainer-queue grouping re-key to
`(reporter_id, clue_text, puzzle_id)` / `(clue_text, puzzle_id, reason)`.
Postgres treats NULLs as distinct, so a null `puzzle_id` degrades dedup
gracefully (duplicates are allowed rather than collapsed) — acceptable, since
reports remain advisory and rate-limited. `V13__player_reports_optional_word`
carries this as an expand-and-contract migration.

## Consequences

**Easier:**
- Players get a first-class report path from every play surface, feeding the
  existing correctif loop instead of a dead end.
- Harm reports reach the maintainer immediately via email without a new alert
  pipeline.

**Harder / watch-outs:**
- A new Brevo secret (`SURVEY_BREVO_API_KEY` + maintainer/sender addresses)
  must be provisioned in the survey namespace and documented in
  `docs/secrets.md`.
- Report ↔ item matching is a text join on `(word_text, clue_text)`; if no
  survey item exists for a reported pair, the "Corriger" path must create one
  via the existing create-or-reuse correctif behaviour.
- No auto-takedown and no auto-training in V1: reports are a maintainer queue,
  not an enforcement mechanism. Both are deliberately deferred to a follow-up
  ADR.
