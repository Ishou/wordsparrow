# Clue definition-quality gates + collision-safe daily regeneration

- **Date:** 2026-06-30
- **Status:** Draft for review
- **Bounded contexts:** `scripts/` (clue-ai pipeline), `grid/` (infrastructure, application, api, worker)
- **Related:** ADR-0013 (offline clue worker), ADR-0042 (daily pre-gen),
  ADR-0024 (dbnary synonym clue), ADR-0050 (a11y), ADR-0075 (progress sync).
  A new ADR is required for the daily-puzzle identity change (Wave 3).

## 1. Problem

Four bad clue/answer pairs were observed on the **prod daily grid**
(wordsparrow.io, grid #181, generated 2026-06-24):

| Clue shown | Answer (slot len) | Why it is wrong |
|---|---|---|
| `Placent` | POSE (4) | plural clue on a singular answer |
| `Font cesser` | RÉPRIME (7) | plural clue on a singular answer |
| `L'aîné` | AINÉE (5) | masculine, self-referential clue on a feminine answer |
| `Rayon lumineux` | RAI (3) | clue is the answer's near-synonym |

All four are **rows in the committed `words-fr.csv`** — prod serves the
CSV faithfully; this is not a stale-deploy problem. They reached the
shipped corpus because the deterministic validation gates do not cover
their failure modes.

### 1.1 Verified root causes

**Number/person disagreement (`Placent`, `Font cesser`).** The answers
are ultra-rare subject-inversion forms — grammalecte tags `posè`
(freq 97) and `réprimè` (freq 0) as `ipre 1isg` (1st-person-singular
inversion, the literary "-je" euphony: *"Posè-je… ?"*).
`scripts/eval/morphology_index.py:29` defines
`PERSON_TOKENS = {1sg,2sg,3sg,1pl,2pl,3pl}` — it does **not** include the
inversion-person tags `1isg/2isg/3isg`. So in `inflect_clue`, the person
constraint silently empties (`persons = target & PERSON_TOKENS = ∅`), the
head verb inflates person-unconstrained, and
`MorphologyIndex.inflect("placer", {ipre})` returns the **first** `ipre`
row of `placer` in lexique file order — which is `placent` (3pl).
Net: a plural clue on a singular answer. The clean siblings
(`pose`→`Place`, `posé`→`Placé`) are correct because their tags are in
`PERSON_TOKENS`.

**Diacritic-blind self-reference (`L'aîné`).** The unaccented variant
rows `ainé`/`ainée`/`ainés`/`ainées` (lemma `ainé`) carry the clue
`L'aîné`. The validator's `_find_lemma_family_leak` (self-reference gate)
misses it because the clue token `aîné` (with circumflex) is compared
against the answer lemma family `ainé` (without) — diacritic-sensitive —
and because it does not flag a gender flip (masculine clue, feminine
answer).

**Cross-lemma synonym proximity (`Rayon lumineux`).** `rai` and `rayon`
are different lemmas, so no self-leak/stem-leak fires (`rai` is 3 chars,
under the 5-char stem-leak floor). It is bad only because `rayon` is
`rai`'s defining near-synonym. **Out of scope** (see §6).

### 1.2 Why the bad clue is the one that surfaces (accent collision)

`pose`, `posé`, `posè` all accent-fold to the same grid letters **POSE**
and collide on one key in `CsvWordRepository`'s `byText` map
(`frenchFromClasspath`, lines ~207-220). The loader sorts by frequency
**descending** then `put`s in a loop; `put` is last-write-wins, so the
**lowest-frequency** colliding variant wins the slot. POSE therefore
carried only `posè`'s `Placent` clue; `pose`'s correct `Place` was
overwritten and lost. Accent-variant clues are not merged (theme overlays
are; main-file collisions clobber). This is a second, independent latent
bug.

### 1.3 Why regenerating today's grid risks the frontend

Daily-puzzle clues are **frozen snapshots**: `EnsureUpcomingDailies`
serializes `placement.chosenClue.text` into `puzzles.payload` JSONB at
generation time; the serve path returns that JSONB with no live CSV
lookup. To clear the bad clues on prod we must regenerate the puzzles.

But `puzzleId` is **deterministic from date**
(`DailyPuzzleSelector.puzzleIdForDate`), and solo progress is keyed by
`puzzleId` only (`localStorageSolo`) with **no shape/version check**.
Regenerating today's grid under the same id would blindly replay a
returning player's saved `(row,col,letter)` entries and "validated" locks
onto a different layout — silent board corruption. (Verified: no
fingerprint on the `Puzzle` model, no guard in the `PlayScreen` restore
path.) New players and players who have not started today are unaffected.

## 2. Goals / non-goals

**Goals**
- Close the deterministic gaps so the number/person-disagreement and
  self-reference classes can never ship again.
- Make the accent-collision pick the **highest-frequency** variant.
- Regenerate today's (and upcoming) daily grids against the corrected CSV
  **without corrupting in-progress boards**.

**Non-goals**
- A synonym-proximity gate. `rai → Rayon lumineux` is **left as-is** (a
  defensible clue; building cross-lemma synonym detection risks
  false-positiving the synonym clues *mots fléchés* relies on).
- Root-fixing the inflater's `1isg` blindness. We **gate-drop** these
  freq-0–97 inversion forms instead of teaching the inflater to inflect
  them correctly — they have no play value, and dropping their clue
  removes them from the pool (`CsvWordRepository` drops blank-clue rows).
- A junk-variant frequency filter (the gate-drop subsumes the cases we
  care about).
- Any frontend code change — the Wave 3 unique-id design makes a
  regenerated grid get a fresh id, so progress can never bind to it.

## 3. Design

### Wave 1 — deterministic gate fixes + CSV scrub (`scripts/`, Python)

1. **Number/person-agreement gate (surface tier — NOT `validate_clue`).**
   This check needs both the surface's morphology and the inflected clue
   head's, so it lives in `build_surface_clues` / `inflect_clue`, not in
   `validate_clue.py` (which is lemma-tier and never sees the surface).
   After inflating the head, compare the inflected clue head's grammalecte
   number/person against the surface's; on a singular↔plural (or person)
   conflict, emit a new `inflection_status` (e.g. `agreement-mismatch`) so
   the row drops to empty-clue. Inflater-bug-proof: it catches
   `posè→Placent` / `réprimè→Font cesser` regardless of the `1isg`
   handling. Add a unit test alongside the existing `inflect_clue` tests.
2. **Diacritic-folded, gender-aware self-reference.** Extend
   `_find_lemma_family_leak` to diacritic-fold both sides (so clue `aîné`
   matches answer-lemma `ainé`) and to flag a gender-flipped self-reference.
   Unit test the `ainée → L'aîné` case.
3. **Runtime guard test** over the committed
   `grid/infrastructure/src/main/resources/words/words-fr.csv` (mirror
   `test_runtime_csv_pleonasms.py` / `test_runtime_csv_finite_tense.py`):
   assert no shipped row trips the agreement gate or the self-reference
   gate. This is the merged-but-not-rebuilt backstop.
4. **Scrub + re-export.** Regenerate the surface table + merge so the
   offending rows go blank, dropping `posè`/`réprimè`/`situè`/`disposè`/
   `insérè` and the unaccented `ainé`/`ainée`/`ainés`/`ainées` from the
   playable pool. Commit the corrected CSV (generated diff, excluded from
   the line cap).

### Wave 2 — accent-collision highest-freq wins (`grid/infrastructure`, Kotlin)

In `CsvWordRepository.frenchFromClasspath`, change the `byText` collision
policy from last-write-wins to **highest-frequency wins**, and **merge**
the colliding variants' clues with the highest-frequency variant's clue as
primary (so POSE keeps `Place` and additionally carries the other valid
variant clues, rather than clobbering). Unit test with a synthetic
accent-collision fixture (`pose`/`posé` folding to POSE).

### Wave 3 — collision-safe daily regeneration (unique puzzleId)

Requires an **ADR** (changes the daily-puzzle identity model; the current
determinism is documented as a multiplayer prerequisite).

- **Identity model:** stop using `puzzleId = deterministicUuid(date)` as
  the stored identity. Each generation inserts a **fresh random UUID**.
  "Today's daily" resolves **date → most-recently-created row for that
  date**.
- **Migration (expand-and-contract):** add `puzzle_date DATE` to
  `puzzles` + index on `(puzzle_date, created_at DESC)`; backfill existing
  rows' `puzzle_date`. Keep the deterministic-id codepath readable until
  the resolver is in place, then contract.
- **Resolver:** new `PuzzleRepository.getCurrentForDate(date)` and a batch
  variant for the archive; generation stamps `puzzle_date`. Update the 3
  call-sites — `PuzzleRoute` daily GET, `ListDailyPuzzlesUseCase`,
  `EnsureUpcomingDailies` idempotency ("a current row exists for date?").
  `DailyPuzzleSelector` keeps `gridNumberForDate` / `difficultyForDate`
  (date-derived, not identity).
- **Regeneration:** a worker path (e.g. `regenerate-dailies` /
  `ensure-dailies --force-date`) that **appends** a fresh-UUID row for a
  date (newest wins). No delete needed — fits the immutable-puzzle design;
  orphaned old rows are GC-able later (out of scope here).
- **Multiplayer:** preserved. Coop pins the id in the lobby (it flows over
  the WS), so intra-lobby consistency holds; independent clients agree via
  the server's date→current resolution. Only a regeneration *during* a
  live session can split old vs new grid across separately-formed lobbies —
  a rare admin action, accepted.
- **No frontend change:** a regenerated grid has a new id → fresh solo
  progress / hint-usage / sync-blob bucket (all keyed by `puzzleId`) → no
  corruption. The frontend already uses the id from the daily response.

W3 will sub-split under the 400-line cap (e.g. 3a: ADR + migration + repo
resolver; 3b: ensure/regenerate + worker subcommand).

## 4. Operational tail (after merge + deploy)

1. Merge W1, W2, W3; deploy `grid-api` + worker (corrected CSV baked in).
2. Run `regenerate-dailies` for today + the upcoming window → fresh ids,
   corrected grids. Returning players reload onto a new id with a clean
   board; no progress corruption.

## 5. Testing

- W1: unit tests for the agreement gate and the diacritic/gender
  self-reference; runtime CSV guard over the shipped wordlist; re-run
  `pytest scripts/eval/`.
- W2: `CsvWordRepository` unit test for accent-collision highest-freq +
  clue-merge.
- W3: repository tests (Testcontainers) for `getCurrentForDate` newest-wins
  and regeneration-appends; `EnsureUpcomingDailies` idempotency-by-date;
  route test that the daily GET returns the latest row. Konsist clean.

## 6. Out of scope / explicitly deferred

- `rai → Rayon lumineux` — left as-is by decision.
- Synonym-proximity (DBnary) gate.
- Inflater `1isg/2isg/3isg` modelling (gate-drop chosen instead).
- Orphaned-puzzle GC after regeneration.
- Cache-control tuning on `/v1/puzzles/daily` (NetworkFirst/5s/1-week is
  acceptable; online clients refetch within seconds).

## 7. Open questions

- ADR number + title for the daily-puzzle identity change (Wave 3).
- Exact regeneration surface: standalone `regenerate-dailies` subcommand
  vs `ensure-dailies --force-date <date>` (lean: explicit subcommand).
- Whether the upcoming-window pre-gen should also be re-run now or just
  today's grid (lean: today + window, since the window froze the same bad
  clues).
