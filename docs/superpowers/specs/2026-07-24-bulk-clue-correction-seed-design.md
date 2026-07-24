# Bulk clue-correction seeding — design

Status: draft · Governs: ADR-0108 amendment (2026-07-24) · Context: `grid/`

## Goal

Replace clues on **already-generated grids** at scale, in place (preserving
`puzzleId` and player progress), without regenerating grids. First user: the
past-participle (ppas) definition replacement (~2,000 lemmas, new agreeing gold
already live in the corpus, `wordsparrow-clue-data` main `691aee3`). Reusable at
GA for any bulk clue-quality migration.

## Mechanism

Reuse ADR-0108's correction path end-to-end, adding only a bulk **seed** step in
front of it:

1. **Seed** — `grid-worker --seed-corrections <source.csv>` bulk-inserts
   `clue_corrections` rows: `kind=replace`, `(word_text, old_clue_text,
   new_clue_text)` from the source, `created_by=<seed job id>`,
   `exported_at=now()` (skip the override flush), `backfill_status=pending`.
   Deduped on `(word_text, old_clue_text)`; skip a key already active.
2. **Backfill** — the *existing* `--process-corrections` sweep patches every
   stored grid whose payload JSONB contains `old_clue_text`, rewriting it to
   `new_clue_text` in place (ADR-0108 §4). Unchanged.
3. **No override flush** — `ExportCorrectionsUseCase` only flushes
   `exported_at IS NULL` rows, and seeded rows are pre-stamped, so the offline
   corpus is untouched (it already carries the gold).

## The ppas source

Build `source.csv` of `(word_text, old_clue_text, new_clue_text)`:

- **Enumerate `(ppas-word, old_clue_text)` from existing grids** — authoritative,
  because a grid froze whatever clue it was generated with (older corpus versions
  differ). Query the grid DB (`puzzles.payload` JSONB) for distinct `(word, clue
  text)` where `word` is a ppas surface (the gold's ~7,500 folded surfaces). This
  is the design's one genuinely new read — confirm whether `PostgresCorrectionPreviewQuery`
  already exposes a "clues currently on grids for word W" query to reuse, else add
  a read-only enumeration query. **UNVALIDATED — confirm the preview query's shape
  before relying on it.**
- **Pick `new_clue_text`** — a random one of the answer's ≤3 gold defs (agreeing
  with the surface's gender/number, produced by the same inflater the corpus uses,
  so it matches what a fresh grid would show). Random-per-answer gives variety, as
  requested.
- Skip pairs where `old_clue_text == new_clue_text` (no-op) and pairs whose old
  clue is already a gold def (grids generated after the corpus went live).

## Implementation waves (small PRs)

1. **Worker seed command** — `--seed-corrections`, `SeedCorrectionsUseCase`,
   `PostgresCorrectionRepository.seed(rows)` (batch insert with the `exported_at`
   pre-stamp + dedupe). Konsist/tests; in-memory repo test.
2. **k8s Job** — a one-shot Job in the grid chart (mirror the process-corrections
   CronJob), reads `source.csv` from a mounted ConfigMap/volume, runs
   `--seed-corrections` then triggers/leaves `--process-corrections` to the
   existing CronJob.
3. **ppas source builder** — a script/command producing `source.csv` from the
   grid-DB enumeration + the gold (random pick). Read-only enumeration.
4. **Dry-run → full run** — see below.

## Dry-run + reverse

- **Dry-run:** seed a handful of ppas words (e.g. 5), run `--process-corrections`,
  verify the grid payloads patched to the new clue AND `puzzleId` + progress
  unchanged (spot-check the affected grids). Only then the full source.
- **Reverse:** wrong seed → a later correction supersedes, or the ADR-0116 reverse
  path. The seed's `created_by` batch id makes the set identifiable.

## Risks

- **Prod grid-DB writes at scale** (~thousands of corrections + one backfill
  sweep). Mitigate: dry-run first; the backfill is resumable + per-grid isolated
  (§4); throttle the seed insert in batches.
- **Source pre-validation** — the seed bypasses the API's length/kind checks, so
  the builder must validate `new_clue_text` (cell-fit, no leak) — reuse the same
  gates the gold already passed.
- **Enumeration correctness** — old clues must match grid text exactly (text-join);
  derive them from the grids, not the (now-updated) corpus.

## Out of scope

Word blocklisting + regeneration (ADR-0110); non-ppas bulk migrations (the
mechanism is generic, but each application specs its own source builder).
