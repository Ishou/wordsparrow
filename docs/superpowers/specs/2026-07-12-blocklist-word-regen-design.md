# Design: Blocklist offensive word + grid regeneration (Wave 3)

Date: 2026-07-12
Status: Design — approved. Follows ADR-0110. Builds on the merged ADR-0108 corrections layer.

## Problem

ADR-0108 handles bad *definitions* (replace / forbid_clue). It deferred the
offensive-*word* case: when the WORD itself is unacceptable, it's physically
placed in already-generated grids and no clue edit removes it. A maintainer must
be able to blocklist the word from the corpus AND scrub it from every grid that
used it.

## Decisions (locked in brainstorming)

- **Trigger:** `MOT_OFFENSANT` reports in the `/signalements` queue; a "Blacklister
  le mot" action (disabled without `wordText`).
- **Scrub scope:** ALL affected stored grids — current + upcoming dailies, every
  archived past daily, and every stored solo grid.
- **Dailies** → regenerate the date; **solo** → delete the row (regenerates on next GET).
- **Gating:** impact preview (dry-run count) + typed-word confirm; `admin:signalements`; audit-logged.
- **Progress:** rely on ADR-0105 (client self-heals); NO server-side orphan cleanup.
- **Corpus durability:** rides the export follow-up (#1564); not re-solved here.

## Key findings that shape the design (from codebase investigation)

- **Daily single-date regen already exists:** `EnsureUpcomingDailiesUseCase.execute(date, force=true)`
  appends a fresh-`puzzleId` row; `getCurrentForDate` is latest-wins (ADR-0081).
  Worker equivalent: `--regenerate-dailies --start-offset=N --window-days=1`.
- **Solo grids** (`LoadOrGeneratePuzzleUseCase.getOrCompute`, `INSERT ... ON
  CONFLICT (puzzle_id) DO NOTHING`) are stored under a client-minted id and
  returned verbatim; they do NOT auto-refresh. To refresh: **delete the row** →
  next GET regenerates against the corrected corpus under the same id.
- **ADR-0105 fingerprint machinery** (`gridFingerprint.ts`, `pullAndMergeOne`,
  `reconcileSoloFingerprint`) already: (a) discards local + heals the server
  `puzzle_progress` row on a same-id structural change (solo delete→regen case);
  (b) makes a new-id daily start clean. Residual = orphaned server rows under
  superseded daily ids (unreachable, RGPD-erased) → left alone.
- **The corrections backfill is patch-only** (`PostgresGridBackfill` +
  `ClueCorrectionPayloadPatch` handle REPLACE/FORBID_CLUE by editing JSONB). It
  **cannot** remove a whole word → blocklist needs a NEW strategy.
- **Overlay already drops words:** `CorrectionAwareWordRepository.applyAll` uses
  `mapNotNull { foldRight(applyTo) }`; a word folding to `null` is dropped. So
  `BLOCKLIST_WORD.applyTo → null` needs **no overlay change**.
- **Multiplayer unaffected:** the lobby snapshots the grid at start (ADR-0018).

## Architecture

```
survey/ (report queue)                grid/ (corpus + grids + corrections)
  GET /v1/signalements  ───┐   POST /v1/corrections/blocklist-word  (202, audited)
  POST .../decision        │   GET  /v1/corrections/blocklist-preview?word=  (dry-run counts)
                           │   GET  /v1/corrections/{id}  (progress — reuses ADR-0108)
                           │   grid/worker: blocklist backfill (regen daily / delete solo)
frontend /signalements ────┴─> "Blacklister le mot": preview → typed-word confirm → grid call → survey action → poll
```

### Corpus (grid domain/application/infrastructure)

- `ClueCorrection.Kind.BLOCKLIST_WORD("blocklist_word")`. `applyTo(word): Word?`
  returns `null` when `foldedWordText == word.text` (ignore `oldClueText`/clues).
- `RecordCorrectionUseCase`: for `BLOCKLIST_WORD`, skip the `forbid_clue`
  last-clue guard (the drop is intentional); record with `word_text` required,
  `old_clue_text` null.
- Migration `V11__blocklist_word.sql` (expand-and-contract): `ALTER ... kind`
  CHECK to include `'blocklist_word'`; drop the `old_clue_text NOT NULL`
  constraint (nullable). Confirm the next free migration version.
- Overlay: **no change** (already drops null-yielding words).

### Preview + endpoint (grid api)

- `GET /v1/corrections/blocklist-preview?word=<folded>` → `{ affectedDailies:int,
  affectedSolo:int }` — a read-only dry-run COUNT over `puzzles` grouped by
  `puzzle_date IS NULL`. Gated `admin:signalements`.
- `POST /v1/corrections/blocklist-word` `{ wordText, reason? }` → `202
  { correctionId, backfillStatus }`. Dedicated audited endpoint (distinct from
  `POST /v1/corrections`), gated `admin:signalements`, `created_by` from session.

### Backfill strategy (grid worker) — NEW

A blocklist job (recorded like ADR-0108 corrections, `backfill_status` pending).
Match stored grids on `payload` placements where `wordText == word` (folded) — a
new match query distinct from the chosen-clue match. Per matched row:
- **Daily** (`puzzle_date` not null): collect distinct dates, and for each call
  `EnsureUpcomingDailiesUseCase.execute(date, force=true)` (window=1) — appends a
  fresh-id regenerated row (word now absent via overlay); latest-wins serves it.
- **Solo** (`puzzle_date` null): `DELETE FROM puzzles WHERE puzzle_id = ?`.
Progress: `grids_matched` = affected rows; `grids_patched` (reused column) counts
processed. Durable/resumable: re-query "rows still containing the word" (a
regenerated daily's new row no longer contains it; a deleted solo is gone) —
idempotent, per-grid failure isolation, heartbeat. Runs under the existing
process-corrections CronJob (extend `ProcessCorrectionsUseCase` to dispatch by
kind, or a sibling use case). Regenerating dailies needs the generator + daily
use case in the worker (already present for `--ensure-dailies`).

Edge note: regenerating a date whose latest row is the current daily changes what
`getCurrentForDate` serves; the ADR-0089 edge cache would serve stale until TTL —
same edge-purge follow-up already noted for ADR-0108; out of scope.

### Frontend (`/signalements`)

- Extend `CorrectionForm` (or a sibling) with **"Blacklister le mot"** (visible
  only when the group has `wordText`; disabled + hinted otherwise). Flow:
  1. Call `GET /v1/corrections/blocklist-preview?word=` → show "X grilles du jour
     et Y grilles libres seront régénérées/supprimées" (tutoiement).
  2. **Typed-word confirmation** — the maintainer types the word to enable the
     destructive button (GitHub-style).
  3. On confirm → `POST /v1/corrections/blocklist-word` → survey
     `decideSignalement({action})` → poll `GET /v1/corrections/{id}` progress
     ("Régénération en cours — n/m grilles" → "Terminé").
- Copy: tutoiement; destructive styling; no pressure language.

## Waves (each ≤400-line PRs, schema-first)

1. **ADR-0110 + spec + plan + orchestration** (this bundle).
2. **Schema-only:** migration V11 (kind CHECK + old_clue_text nullable) +
   `grid/api/openapi.yaml` `POST /v1/corrections/blocklist-word` (202) + `GET
   /v1/corrections/blocklist-preview` + regenerate frontend types.
3. **grid producer:** `BLOCKLIST_WORD` domain `applyTo`; record path (skip
   last-clue guard); preview count query + repo method; the two endpoints; wiring.
   TDD; property-test the null-drop overlay behavior.
4. **grid worker:** blocklist backfill strategy (match-on-word; regen-daily via
   `execute(date,force)`; delete-solo); dispatch by kind in the worker; resume /
   idempotency / per-grid-failure tests.
5. **frontend:** "Blacklister le mot" + preview + typed-word confirm + progress
   polling; MSW tests; a11y.

## Testing

- Domain: `BLOCKLIST_WORD.applyTo` drops the word; overlay omits it from
  `findByLength`/pattern; record path records without the last-clue rejection.
- Worker: seed a daily + a solo containing the word → daily gets a new latest row
  without the word (fresh puzzleId), solo row deleted; idempotent re-run patches 0;
  resume after interrupt; per-grid failure isolation; `blocklist-preview` counts
  match reality.
- Auth: player/anon → 403 on both endpoints; only `admin:signalements` passes.
- Frontend: preview renders counts; the destructive button is disabled until the
  word is typed exactly; the full compose (blocklist → survey action → progress)
  fires; "Blacklister" hidden/disabled without wordText.

## Out of scope

- Server-side cleanup of orphaned `puzzle_progress` rows (ADR-0105 handles the
  live path; orphans are harmless).
- Offline-corpus export of the blocklist (rides #1564).
- Edge-cache purge of a regenerated current daily (shared ADR-0108/0089 follow-up).
- Un-blocklisting UI (the correction rows are the audit trail).

## Open (non-blocking)

- Whether regenerating many archived dailies should batch/rate-limit (the daily
  loop is sequential; a word in hundreds of archived dailies = hundreds of
  regens). Decide from the real affected-count distribution during Wave 4.
