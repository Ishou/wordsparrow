# ADR-0110: Blocklist offensive word + grid regeneration

## Status

Accepted

## Context

ADR-0108 (grid clue corrections) shipped `replace` and `forbid_clue` corrections
and **explicitly deferred** the offensive-*word* case: when the word itself (not
its definition) is unacceptable, editing a clue cannot help — the word is
physically placed in already-generated grids. ADR-0108 §2 named this the
"blocklist word" path and deferred it "because regeneration mints a fresh
`puzzleId` (ADR-0081) and orphans saved progress, and needs extra gating."

Investigation of the existing machinery changes the risk picture:

- **Daily regeneration already exists.** `EnsureUpcomingDailiesUseCase.execute(date,
  force=true)` (worker `--regenerate-dailies --start-offset=N --window-days=1`)
  appends a fresh-`puzzleId` row for a single date; `getCurrentForDate` is
  latest-wins by `created_at` (ADR-0081). No new regeneration engine is needed.
- **Client progress is largely self-healing (ADR-0105).** The grid fingerprint
  excludes typed letters but includes structure; on a solo grid's next open a
  fingerprint mismatch discards local progress **and heals the server row**
  (push-back). A regenerated daily gets a brand-new `puzzleId`, so the player
  simply starts the new daily clean — there is nothing to orphan on the client.
- The only residual is **server-side `puzzle_progress` rows under superseded
  daily `puzzleId`s**, which become unreachable dead cruft (never re-served,
  RGPD-erased under ADR-0045).
- The existing corrections backfill is **patch-only** — it rewrites clue text or
  re-picks a clue; it cannot remove a whole word from a grid.
- Multiplayer is unaffected: a lobby snapshots the full grid at game start
  (ADR-0018) and never re-fetches.

## Decision

Add a **`blocklist_word`** correction that drops the word from generation and
scrubs it from every already-generated grid by regeneration/deletion.

1. **Corpus.** New `ClueCorrection.Kind.BLOCKLIST_WORD`. `applyTo(word)` returns
   `null` for the named word unconditionally (ignoring clues). The existing
   `CorrectionAwareWordRepository` already drops null-yielding words via
   `mapNotNull`, so **future generation excludes the word with no overlay
   change**. `RecordCorrectionUseCase` skips the last-clue guard for this kind.
   Migration (expand-and-contract): add `'blocklist_word'` to the `clue_corrections.kind`
   CHECK and relax `old_clue_text` to nullable (a blocklist carries no clue
   text); `word_text` is required for this kind.

2. **Scrub scope: all affected grids, archive included.** A new durable backfill
   strategy (the patch-only one cannot remove a word) matches stored `puzzles`
   whose `payload` placements contain the word, and per match:
   - **Daily** (`puzzle_date` set) → regenerate that date via
     `EnsureUpcomingDailiesUseCase.execute(date, force=true)` (fresh-id row,
     latest-wins). Applies to archived past dailies too, since the calendar
     exposes them.
   - **Solo** (`puzzle_date` null) → **delete** the stored row; the next GET
     re-runs `getOrCompute` against the corrected corpus (the word is gone), and
     the same-`puzzleId` structural change triggers the ADR-0105 discard+heal.
   Reuses ADR-0108's job scaffolding (`CorrectionWorkStore`, status
   pending→running→done/failed, progress counters, the process-corrections
   CronJob).

3. **Progress.** Rely on ADR-0105 for the client (solo: discard+heal; daily: fresh
   `puzzleId`). **No proactive server-side cleanup** of orphaned daily
   `puzzle_progress` rows: they are unreachable and RGPD-erased, and that table is
   owned by `identity/` (cross-context). Noted as a possible future follow-up, not
   built here.

4. **Gating (destructive → extra safety).** `POST /v1/corrections/blocklist-word`
   is a dedicated, audit-logged (`created_by`) endpoint gated by `admin:signalements`.
   The `/signalements` UI's "Blacklister le mot" action requires an **impact
   preview** (`GET /v1/corrections/blocklist-preview?word=` → affected daily +
   solo counts, a dry run) shown before a **typed-word confirmation**. The action
   is disabled when the report carries no `word_text`.

5. **Durability.** Like ADR-0108's export, the blocklist must reach the offline
   corpus so a rebuild does not reintroduce the word — it rides the same export
   mechanism tracked in issue #1564; not re-solved here.

## Threat model

Extends ADR-0108's. This action is **destructive** (regenerates/deletes stored
grids), so it is gated more strongly than replace/forbid: `admin:signalements`
(maintainer-only, deny-by-default) **plus** a client-side impact preview and a
typed-word confirmation to prevent misclicks; every blocklist is an audited row
(`created_by`, `word_text`). Blast radius is bounded to grids that actually
contain the word; regeneration cannot reintroduce it (the overlay drops it). A
compromised maintainer session could mass-regenerate grids — mitigated by the
audit trail and the fact that regeneration produces valid puzzles (no data loss
of player-facing service; only orphaned progress cruft).

## Consequences

- **Easier:** offensive words are removed from the corpus and every grid that used
  them (archive included), with player progress self-healing via ADR-0105.
- **Harder / new surface:** a new backfill strategy (regenerate-daily /
  delete-solo) distinct from patch; a new destructive endpoint + preview; a
  solo-grid delete path that did not exist.
- **Deliberately not done:** server-side orphaned-progress cleanup (harmless
  cruft); the offline-corpus export (rides #1564).

Rollout is staged as small PRs per ADR-0001 §3/§4: this ADR, then schema, grid
producer, grid worker, frontend. Full design in
`docs/superpowers/specs/2026-07-12-blocklist-word-regen-design.md`; wave plan in
`docs/superpowers/plans/2026-07-12-blocklist-word-regen.md`.
