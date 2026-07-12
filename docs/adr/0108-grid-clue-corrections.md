# ADR-0108: Grid clue corrections & moderation

## Status

Accepted

## Context

A player reports a definition (clue) that is offensive or has a typo, via the
ADR-0103 clue-report queue (`GET /v1/signalements`). Today a maintainer can only
mark that report *handled* or *dismissed* — nothing is fixed. We need the
maintainer to actually correct a flagged definition, and the correction must land
in **two** places whose write timelines differ:

1. **The corpus** — the source of truth — so the bad clue is never placed into
   *future* grids. The corpus is an offline artifact: `words-fr.csv` is built by
   the Python pipeline (ADR-0013, ADR-0097, ADR-0100) and published to object
   storage; the Kotlin runtime reads it read-only from `$CORPUS_DIR`. A maintainer
   click cannot rebuild it.
2. **Every already-generated grid** that used it — so the fix shows up on grids
   already in players' hands, including the current daily. A generated grid freezes
   its clue text into the `puzzles.payload` JSONB (`SerializedClue.text`); there is
   no normalized clue table and no update endpoint.

Constraints that force the shape of the decision:

- A clue-report carries only the raw `clueText` string, an optional solved
  `wordText`, an optional `puzzleId`, and a `reason` (ADR-0103). There is **no**
  clue id, direction, or position. The identity of "the clue to fix" is therefore
  the `clueText` string, matched by text-join — exactly how the report queue
  already groups reports.
- `survey/` and `grid/` are separate bounded contexts; cross-context backend
  imports are forbidden (ADR-0001 §1). The corpus and the grids are owned by
  `grid/`.
- The `contribuer` capability's scope is still under maintainer review (ADR-0079),
  and a precedent exists for capability-scope broadening at GA (`billing:subscribe`,
  ADR-0080). Admin moderation must stay maintainer-only regardless, so it gets its
  own capability distinct from `contribuer`.

## Decision

Introduce a **clue-corrections** capability owned by `grid/`.

1. **Corrections store.** A new `clue_corrections` table in `grid/` records each
   correction as a durable, audited row (`kind`, `word_text?`, `old_clue_text`,
   `new_clue_text?`, `reason?`, `created_by`, timestamps, and backfill-progress
   columns). The correction identity is `old_clue_text` (plus `word_text` for a
   word blocklist). Migrations are expand-and-contract; the table has **no** FK to
   `puzzles` — the link is the text-join, matching ADR-0103's grouping.

2. **Operations.**
   - **Replace text** — override the clue text for the word.
   - **Forbid clue** — drop that clue for the word; valid only while the word
     keeps ≥1 usable clue. Forbidding a word's only clue is **rejected**
     (`409 LAST_CLUE_FORBIDDEN`): an empty clue list makes the word unplaceable,
     which is the blocklist-word path, not a cheap forbid. The maintainer is told
     to Replace or Blocklist instead.
   - **Blocklist word** — drop the word from the corpus and regenerate the grids
     that used it. Deferred to a later ADR/spec because regeneration mints a fresh
     `puzzleId` (ADR-0081) and orphans saved progress, and needs extra gating.

3. **Corpus fix = runtime overlay + offline export.** A
   `CorrectionAwareWordRepository` decorator wraps `CsvWordRepository` and applies
   active corrections to each returned `Word` at generation time. This mirrors the
   *conceptual shape* of the existing themed-clue overlay (a merge applied to
   `Word`s), though that overlay is inline in `CsvWordRepository.load()` today —
   this ADR introduces the first `WordRepository`-wrapping decorator in `grid/`. Future grids — daily pre-gen and live solo —
   are clean immediately, without a corpus rebuild. A worker command periodically
   exports un-exported corrections into `data/curated/clue_overrides_fr.csv` (the
   override file the Python pipeline already merges) so the durable offline corpus
   catches up.

4. **Existing-grid backfill is async, durable, and resumable.** Recording a
   correction returns `202`; patching every stored grid whose payload contains the
   clue runs as a `grid-worker --process-corrections` sub-command driven by a k8s
   CronJob (the ADR-0042 one-shot-CLI pattern; the grid worker is not a
   long-running consumer). The work queue *is* "rows still matching
   `old_clue_text`", so a patched row drops out and a crashed worker resumes on the
   remainder — idempotent, with per-grid failure isolation, a heartbeat, and
   progress columns polled via `GET /v1/corrections/{id}`. Patches rewrite the
   payload in place, preserving `puzzleId` and therefore player progress.

5. **Capability & flow.** A new maintainer-only capability `admin:signalements`
   (identity `capabilitiesFor`, granted to `MAINTAINER` only, ADR-0079/0080) gates
   the correction routes. Because `grid/` has no session/capability plumbing today,
   grid/api ports survey's `SessionMiddleware` + `IdentityClient` and exposes a
   generic `requireCapability(cap)` guard. The `/signalements` review UI composes
   the two calls at the frontend — grid correction, then the existing survey
   `action` decision — keeping the contexts decoupled at the backend.

## Threat model

The correction routes mutate the corpus overlay and every stored grid, so they are
a privileged surface.

- **Who can call.** `admin:signalements`, granted only to `MAINTAINER` (a DB role
  set by the ops-run `identity-api --set-maintainer-roles` bootstrap over an
  explicit id list). Deny-by-default: absent capability ⇒ 403; anonymous and player
  callers never reach the handler. The frontend gate is cosmetic; the server is
  authoritative.
- **Abuse surface.** A compromised maintainer session can rewrite or forbid clues.
  Mitigations: every correction is an audited row stamped with `created_by`; there
  is no player-reachable path; corrections are reversible in effect (a later
  correction supersedes an earlier one) and leave a full trail. Blast radius is
  bounded to clue *text* — the destructive word-blocklist + regeneration path is
  out of scope here and will carry its own stronger gating (typed-word confirm,
  audit, impact preview) in its own ADR.
- **Input validation.** `old_clue_text`/`new_clue_text` are length-bounded and
  treated as data (parameterized SQL, JSONB value rewrite) — no dynamic query
  construction from report text.

## Consequences

- **Easier:** one maintainer action fixes both the corpus (future) and every stored
  grid (existing); offensive/typo clues stop appearing immediately in new
  generation and converge in existing grids within minutes, with progress preserved.
- **Harder / new surface:** grid gains its first session/capability plumbing and a
  new worker CronJob; the corrections overlay is now on the generation hot path
  (mitigated: small table, cheap read). The offline corpus is authoritative only
  after the export runs — the runtime overlay is the immediate source of truth in
  between, which the export reconciles.
- **Deferred:** word blocklisting + grid regeneration (progress orphaning) is a
  separate decision.

Rollout is staged as small PRs per ADR-0001 §3/§4: this ADR, then the schema-only
OpenAPI PR, then identity, grid producer, grid worker, and frontend. Full design in
`docs/superpowers/specs/2026-07-12-grid-clue-corrections-design.md`; wave plan in
`docs/superpowers/plans/2026-07-12-grid-clue-corrections.md`.
