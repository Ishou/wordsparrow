# Design: Player clue/word report ("Signaler")

**Date:** 2026-07-11
**Status:** Approved (brainstorm) — pending spec review, then plan
**Bounded contexts:** `survey/` (owns the record), `frontend/` (capture + triage UI)

## Problem

Players see bad clues while solving — wrong meaning, offensive content,
grammar errors, difficulty mismatches, definitions that leak the answer.
Today there is **no way for a player to flag one from the play grid**. The
only "Signaler" flow lives on the `/contribuer` annotation screen and is
aimed at annotators rating random items, not players in context.

We want a player-facing report affordance whose reports reach the
maintainer, connect to the existing correctif / gold-weight training loop,
and respect RGPD.

## Goals

- One-tap report from anywhere a clue is shown (solo/daily, multiplayer,
  homescreen mini-game).
- Reports land in a **maintainer review queue**. Nothing auto-acts (low
  traffic; deferred until it matters).
- **Harm** reports (offensive) email the maintainer immediately for fast
  reaction; **quality** reports accumulate for self-paced polling.
- Accepted reports become **correctifs**, reusing the existing
  gold-weight training signal — no new training path.
- RGPD-clean: minimal personal data, disclosed at point of collection and
  on `/confidentialite`, erased on account deletion.

## Non-goals (V2+)

- Auto-hiding / suppressing a reported clue from live play.
- Auto-deriving training weight from raw player reports (only
  maintainer-accepted correctifs feed the gold loop, unchanged).
- Cross-guest dedup or per-reporter trust weighting.
- Difficulty analytics / aggregation dashboards.
- Automated retention purge job (documented; deferred).

## Key constraints discovered in the code

1. **No clue ID exists.** Clues are identified only by `(word text, clue
   text)` raw strings; the corpus is a CSV whose row indices are unstable
   across regenerations (see `grid/.../db/migration/V3__create_clue_cooldown.sql`,
   which uses `(session_id, word_text, clue_text)` for the same reason).
   Every report must carry those two strings plus puzzle context.
2. **A report is not game state.** It is a fire-and-forget action, so it
   travels over a **synchronous REST call**, not the multiplayer
   WebSocket. One endpoint serves all play modes.
3. **`survey/` already owns clue quality** — `FlagReason`, correctifs,
   senses/POS, `maintainer_roles`, `GoldWindowPolicy`, and it already
   consumes identity's `UserDeleted` NATS event
   (`UserDeletedConsumer` → `AnonymizeUserRatingsUseCase`). It is the
   natural home for the record.
4. **There is no shared mailer, and ADR-0032 is not code.** ADR-0032 is a
   SigNoz-UI-configured 5xx alert over Gmail SMTP. Application email in
   this repo is **Brevo transactional, per-context** (identity ADR-0092,
   billing ADR-0094): a `fun interface EmailSender` port + a
   `BrevoEmailSender` adapter per context. Survey has none today — the
   harm email requires a **new survey `EmailSender` port + Brevo
   adapter**, and therefore a new Brevo API-key secret + config in the
   survey namespace.
5. **The answer word is not available on `CurrentCluePanel`.** The panel
   has the clue text + cells, not the solution word. `word_text` must be
   threaded from the parent grid (derived from the clue's cell entries),
   not read off the panel.

## Architecture overview

```
 play grid (solo / MP / mini-game)
        │  ⚏ Signaler  →  bottom sheet (reason + optional note)
        ▼
 POST /v1/signalements  ───────────────►  survey/ context
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                      ▼                     ▼
                  persist PlayerReport   harm? → email you    quality → queue
                        │                (survey Brevo EmailSender)
                        ▼
             maintainer /signalements page
                   Rejeter → DISMISSED
                   Corriger → existing CorrectifField
                              → survey_item + correctif
                              → gold-weight loop → ACTIONED
```

Frontend→context-API calls are permitted; no backend `game→survey` import
is introduced. The frontend already ships a `survey/` API client (sondage
flow), so this reuses an existing edge.

## Reason taxonomy — `ReportReason`

New player-facing enum, distinct from the annotator `FlagReason` (different
provenance, taxonomy, lifecycle) but overlapping reasons pre-map for
triage. Fixed tap list + `AUTRE` + one optional free-text note.
Copy uses tutoiement.

**Harm → email the maintainer immediately:**

| enum | player copy (fr) |
|---|---|
| `MOT_OFFENSANT` | le mot est choquant / déplacé |
| `DEFINITION_OFFENSANTE` | la définition est choquante |

**Quality → queue:**

| enum | player copy (fr) | maps to |
|---|---|---|
| `ERREUR_SENS` | la définition ne colle pas au mot | `FlagReason.ERREUR_SENS` |
| `ERREUR_GRAMMAIRE` | bon sens, mais faute d'accord / genre / conjugaison | — |
| `DEFINITION_REVELE` | la définition contient ou trahit la réponse | `FlagReason.AUTO_REFERENCE` |
| `AMBIGU` | plusieurs réponses possibles | — |
| `TROP_FACILE` | trop facile | — |
| `TROP_DIFFICILE` | trop difficile | — |
| `AUTRE` | autre (note encouragée) | `FlagReason.AUTRE` |

`MOT_INVALIDE` (mot inexistant / mal orthographié) was folded into `AUTRE`
to keep the tap list short on mobile (9 targets). `TROP_FACILE` /
`TROP_DIFFICILE` kept separate because they are opposite signals.

## Data model — `survey/`

New `PlayerReport` aggregate + `player_reports` table.

| column | type | notes |
|---|---|---|
| `report_id` | UUID PK | UUID v7 |
| `word_text` | text | folded A–Z, the stable word identity |
| `clue_text` | text | the reported definition string |
| `reason` | text/enum | `ReportReason` |
| `note` | text NULL | optional free text, maintainer-only |
| `puzzle_id` | UUID NULL | context |
| `surface` | text | `SOLO` \| `DAILY` \| `MULTIPLAYER` \| `MINI_GAME` |
| `reporter_id` | UUID NULL | set **only** if authenticated |
| `status` | text | `PENDING` \| `DISMISSED` \| `ACTIONED` |
| `created_at` | timestamptz | |
| `triaged_at` | timestamptz NULL | |
| `triaged_by` | UUID NULL | maintainer |

- The `/signalements` view **groups by `(word_text, clue_text, reason)`
  with a count**, so a genuinely bad clue rises by volume.
- Matching a report to an existing `survey_item` is a text join on
  `(mot, definition)`. If no item exists, creating the correctif creates
  it — `SubmitRatingUseCase` already does create-or-reuse.
- Server-side dedup on `(reporter_id, word_text, clue_text)` for
  authenticated reporters (unique-ish guard, soft). Guests are anonymous
  so cannot be deduped server-side; a client `localStorage` guard prevents
  the same client re-reporting the same `(word, clue)`.

## Capture path

- **Endpoint:** `POST /v1/signalements` on `survey/` (schema-first:
  `survey/api/openapi.yaml` merges before implementation, per ADR-0001
  §3 / ADR-0003). Auth optional — guests allowed; `reporter_id` filled
  from the auth principal when present.
- **Payload:** `word_text`, `clue_text`, `reason`, `note?`, `puzzle_id?`,
  `surface`.
- **Affordance:** a ⚏ / overflow action on the **active clue in
  `CurrentCluePanel`** (the sticky rail that already shows the focused
  clue). Tapping opens a mobile-first **bottom sheet**: reason list +
  optional note + submit. Attaching to the active clue gives unambiguous
  clue identity and avoids colliding with grid tap / double-tap gestures.
  `clue_text` comes from the panel; **`word_text` is threaded in from the
  parent grid** (derived from the clue's cell entries — the panel does not
  hold the solution word). One shared hook/component wires into solo grid,
  multiplayer lobby, and the homescreen mini-game.
- **Point-of-collection notice** inside the sheet: one line —
  "Ton signalement nous aide à améliorer les grilles — [en savoir plus]"
  linking to `/confidentialite`, mirroring how `SignInButton` /
  `PrivacyNotice` already link there.
- **Ack + guard:** toast "Merci, c'est signalé"; `localStorage` guard so
  the same client can't re-report the same `(word, clue)`.

## Routing

- **Harm reason** on create → email the maintainer immediately via a
  **new survey `EmailSender` port + Brevo adapter** (mirroring identity
  ADR-0092 / billing ADR-0094; there is no shared mailer and ADR-0032 is
  not code). Requires a Brevo API-key secret + config in the survey
  namespace. Subject e.g. "⚠ Signalement — MOT_OFFENSANT : <mot>", sent to
  a configured maintainer address.
- **Quality reason** → persist only; surfaces in `/signalements`.

## Triage — `/signalements` page

- Maintainer-only, gated on the existing **`contribuer` capability**
  (ADR-0079) exactly like `/contribuer`: `useCapabilityGate('contribuer')`
  client-side (denied → 404 `NotFoundScreen`), `requireContribuer()`
  enforced server-side.
- Lists **PENDING** reports, grouped and sorted (harm first, then by
  count, then recency).
- Per group: **Rejeter** (→ `DISMISSED`) or **Corriger** (→ opens the
  existing `CorrectifField` prefilled with mot + current definition →
  submit runs the correctif `FilterPipeline` + gold-weight loop → report
  → `ACTIONED`).

## RGPD / privacy

- `reporter_id` nullable; anonymization rides the **existing**
  `UserDeletedConsumer` → `AnonymizeUserRatingsUseCase` (no new consumer):
  add a `signalements.anonymiseForUser(userId)` call there to null out
  `reporter_id` on that reporter's reports (keep the quality signal).
- `note` is maintainer-only. Retention: reports kept until triaged, note
  purged per retention policy (automated purge = V2; documented now).
- **`/confidentialite` disclosure:** new `v2.confidentialite.signalements.*`
  i18n section on `ConfidentialiteScreen.tsx`, modeled on the existing
  sondage section (`privacy-notice-sondage-section.test.tsx` is the
  precedent). Discloses: what is collected (reported `(mot, définition)`,
  reason, optional note, and — only if signed in — the account link);
  purpose/legal basis (content-quality improvement, legitimate interest);
  retention; and rights (anonymized on account deletion).

## Governance

- A short **ADR-0103** for the player-report feature: new player-facing
  capability, its relationship to survey `FlagReason` / correctifs, the
  new survey Brevo `EmailSender` adapter, and the RGPD posture. Update
  `docs/adr/INDEX.md` in the same PR (registry-coherence gate); reference
  ADR-0056 (survey context), ADR-0079 (capability authz), ADR-0092/0094
  (Brevo email precedent).
- **Schema-first** PR for `survey/api/openapi.yaml`.
- **Auth/authz note:** the `/signalements` maintainer gate is an authz
  surface — include the (small) threat model in that PR's body per
  CLAUDE.md.

## Delivery — PR waves

Each wave fully reviewed + merged before the next (per the wave-of-PRs
convention). Ordered by dependency.

1. **ADR + schema.** ADR for the feature + `survey/api/openapi.yaml`
   `POST /signalements` schema + `INDEX.md` update.
2. **survey domain + persistence.** `PlayerReport` aggregate,
   `ReportReason`, Flyway migration for `player_reports`, repository.
3. **Capture endpoint + routing.** `POST /v1/signalements` use case +
   Ktor route (optional auth), harm-email routing via a new survey
   `EmailSender` port + Brevo adapter, and `signalements.anonymiseForUser`
   added to the existing `AnonymizeUserRatingsUseCase`.
4. **Frontend capture + privacy.** ⚏ affordance on `CurrentCluePanel` +
   report bottom sheet + shared hook wired into solo/MP/mini-game +
   point-of-collection notice + **`/confidentialite` `signalements`
   section**. (One privacy workstream — if this exceeds the 400-line cap,
   invoke the standing cap-override with that justification.)
5. **Triage page.** Maintainer-only `/signalements` queue: grouped list,
   Rejeter / Corriger (reusing `CorrectifField`), threat model in PR body.

## Open questions / tunables

- Final reason-list wording (fr copy) to be confirmed during wave 4.
- Sort/threshold heuristics on `/signalements` (count-first vs recency)
  are cheap to tune post-ship.
