# ADR-0111: Server-resolved answer word on signalements

## Status
Proposed

## Context
The maintainer triage queue (`/signalements`, ADR-0103) shows the reported
clue plus a `wordText`. That `wordText` is whatever the player had typed into
the cells at report time — captured client-side. It is `null` when the player
had not solved the cell and *wrong* when their letters were wrong, so the
queue frequently shows no word or a garbled one. The maintainer needs the
actual answer word next to the definition to triage a report.

The client cannot supply the real word: ADR-0076 keeps canonical letters off
the wire (getPuzzle, `/validate`, hints, and the teaser all withhold plaintext
answers), so no browser holds the solution. The word must be resolved
server-side. The maintainer has authorised showing the answer word in the
queue — it is a maintainer-only (contribuer, ADR-0079) surface, never returned
to the reporting player.

Resolution has two constraints from the maintainer:
1. **Exactly one word** — the single word placed on *that grid* for *that
   clue*, not the corpus's many clue→word candidates.
2. **Durable** — the word must remain on the report even after the clue is
   later corrected (ADR-0108 patches clue text, not the answer) or the puzzle
   ages out.

`puzzleId` cannot be made mandatory: the mini-game teaser (ADR-0073) reports
carry no puzzle — its sample word is `{clue, answerLength, opaque HMAC token}`
with no puzzleId and no reversible answer. So the resolver must dispatch on
`surface`, not assume a puzzleId.

## Decision
Resolve the answer word **server-side at report submit** and **persist it on
the signalement**. The queue then reads a stored string — durable by
construction (constraint 2), independent of later corpus/puzzle changes.

- **Capture maximum context** on each report: `surface` (always), `clueText`
  (always), `puzzleId` (when the surface has one). The client no longer needs
  to send a solved word — `wordText` is deprecated on the request and the
  server owns the field.
- **Surface-dispatched resolution** (constraint 1 — one word from the grid):
  - `solo` / `daily` / `multiplayer` → the grid's stored puzzle. A clue is
    unique within a generated grid, so `puzzleId + clueText` identifies the one
    placement and yields its `wordText`.
  - `mini_game` → the grid corpus (`WordRepository`), the same source the
    teaser samples from. *Built when a report button ships on that surface;
    the resolver branch is stubbed until then* — mini-game has no report
    button today.
- **Resolution runs in grid, behind the existing service-token gate.** survey
  calls a new `POST /v1/puzzles/{puzzleId}/resolve-word` on grid-api,
  `X-Service-Token`-authenticated exactly like `validate-word` (ADR-0084). It
  reads the stored placement and returns the plaintext word to the survey
  service only. It is **never on the public ingress** — a browser calling it
  would leak the daily solution (ADR-0076 §9). Unlike `validate-word` (binary),
  this endpoint returns plaintext, so its exposure is strictly first-party
  service-to-service; both token holders (survey, game) are backend services.
- survey reuses the established cross-context client pattern (`IdentityClient`
  → identity) for the call. On grid-unreachable, the report is still accepted
  with the word unresolved and a backfill retry fills it later — a grid blip
  never loses a report.

Licensing (ADR-0058): the exposed field is a corpus headword (Hunspell-fr,
MPL-2.0, per ADR-0013), the same shape ADR-0073 already exposes publicly; here
it is narrower (maintainer-only), so no new licensing surface.

## Consequences
- The queue always shows the real answer word, stable across clue corrections
  and puzzle ageing (it is stored, not recomputed).
- New runtime dependency survey-api → grid-api at report submit, mirroring the
  existing game-api → grid-api `validate-word` call; degrades to accept +
  backfill when grid is unavailable.
- A grid endpoint now returns a plaintext answer word. It is service-token
  gated and off the public ingress; the threat model is ADR-0084's, tightened
  to "plaintext, so never browser-reachable." The daily-solution no-leak
  posture (ADR-0076) is preserved: the word reaches only the survey service and
  the contribuer-gated maintainer queue, never the reporting player.
- `puzzleId` stays nullable; the per-surface "resolves to a word" invariant is
  enforced in the application layer, not the schema.
- Mini-game reporting remains unbuilt; when it ships, only the stubbed corpus
  resolver branch and its report button are added — no schema rework.
