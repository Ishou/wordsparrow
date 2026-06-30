# Clue Definition Gates + Collision-Safe Daily Regeneration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this repo ships waves as
> separate PRs via the `dispatch` skill (ADR-0001 §1, 400-line cap, §6a
> review). Each wave below is one or more PRs, fully reviewed + MERGED
> before the next wave starts. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the deterministic clue gates that let four bad definitions
ship to the prod daily grid, fix the accent-collision clue clobber, and
regenerate the daily grids collision-free via unique puzzle ids.

**Architecture:** Three waves across two bounded contexts. W1 hardens the
Python clue pipeline (surface-tier agreement gate + diacritic self-ref +
runtime guard + CSV scrub). W2 fixes `CsvWordRepository` accent-collision
to keep the highest-frequency variant. W3 (ADR-gated) makes each daily
generation a fresh UUID resolved date→latest, so regenerating today's grid
gets a new id and cannot corrupt in-progress boards.

**Tech Stack:** Python 3.12 + pytest + grammalecte lexique (scripts);
Kotlin 2.x + Ktor + Postgres/Flyway + Konsist + JUnit5/AssertJ/Testcontainers
(grid).

**Spec:** `docs/superpowers/specs/2026-06-30-clue-definition-gates-and-daily-regen-design.md`

## Global Constraints

- **PR cap:** 400 lines of diff excluding generated code/blank lines
  (ADR-0001 §4). The scrubbed `words-fr.csv` is generated — excluded.
- **Branch:** `<type>/<short-desc>`; **commits:** conventional with
  bounded-context scope; **DCO:** `git commit -s` on every commit.
- **TDD:** failing test first for all domain/pipeline logic.
- **No `println`/`console.log`;** one-line WHY comments only; no multi-line
  comment blocks in new code.
- **ADR-first:** W3 needs ADR-0080 merged before its implementation PRs
  (it changes the daily-puzzle identity contract). Update `docs/adr/INDEX.md`
  in the ADR PR (registry-coherence gate).
- **Run `scripts/adr-context.sh <path>...`** before each wave; read matching
  ADRs in full (W3 touches persistence + routes + worker).
- **Migrations are expand-and-contract** (ADR convention).
- After touching `validate_clue.py`/`inflect_clue.py`/`build_surface_clues.py`/
  the committed `words-fr.csv`, run `pytest scripts/eval/` (the runtime
  guards live there).

---

## Wave 1 — Deterministic gate fixes + CSV scrub (`scripts/`, Python)

**One PR.** Scope: `feat(clue-ai): gate number/person disagreement +
diacritic self-reference, scrub words-fr.csv`. Bundle the spec doc with
this PR (it is the governance artifact; no separate ADR — these are
validator rules, not a contract change).

**Files:**
- Modify: `scripts/eval/validate_clue.py` (diacritic-fold the self-ref gate)
- Test: `scripts/eval/test_validate_clue.py`
- Modify: `scripts/clue_generation/build_surface_clues.py:~159-165,~204-210`
  (agreement gate + drop status)
- Create: `scripts/eval/test_runtime_csv_agreement.py` (runtime guard)
- Modify (generated): `grid/infrastructure/src/main/resources/words/words-fr.csv`

### Task 1.1 — Diacritic-folded self-reference gate

**Interfaces:**
- Produces: `_strip_accents(s: str) -> str` (module-private helper in
  `validate_clue.py`); `_find_lemma_family_leak` keeps its signature
  `(clue, target_lemma, index) -> str | None`.

- [ ] **Step 1: Write the failing test** in `scripts/eval/test_validate_clue.py`:

```python
def test_self_reference_matches_across_diacritics(real_index):
    # answer lemma 'ainé' (no circumflex); clue 'L'aîné' (with circumflex)
    # must be flagged — same word, diacritic variant.
    assert _find_lemma_family_leak("L'aîné", "ainé", real_index) is not None

def test_self_reference_still_clean_for_unrelated_clue(real_index):
    assert _find_lemma_family_leak("Cours d'eau", "ainé", real_index) is None
```

(Use the existing test module's `real_index` fixture / lexique loader; if
absent, load `MorphologyIndex` from `GRAMMALECTE_LEX` like the other tests.)

- [ ] **Step 2: Run, verify it fails**

Run: `pytest scripts/eval/test_validate_clue.py -k self_reference -v`
Expected: `test_self_reference_matches_across_diacritics` FAILS (returns None today).

- [ ] **Step 3: Implement** — add the fold helper and apply it on both sides
of the family comparison in `_find_lemma_family_leak`:

```python
import unicodedata

def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )
```

In `_find_lemma_family_leak`, build the family as folded forms and compare
folded clue tokens:

```python
    family = {_strip_accents(target)}
    for surface, _tags in index.by_lemma.get(target, []):
        family.add(_strip_accents(surface.lower()))
    if len(family) <= 1:
        return None
    for tok in _TOKEN_RE.findall(clue):
        if _strip_accents(tok.lower()) in family:
            return tok
    return None
```

- [ ] **Step 4: Run, verify pass**

Run: `pytest scripts/eval/test_validate_clue.py -k self_reference -v` → PASS.
Then full module: `pytest scripts/eval/test_validate_clue.py -v` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/validate_clue.py scripts/eval/test_validate_clue.py
git commit -s -m "feat(clue-ai): diacritic-fold the self-reference gate"
```

### Task 1.2 — Surface-tier number-agreement gate

**Interfaces:**
- Produces: `_verb_number(tags: set[str]) -> str | None` in
  `build_surface_clues.py` (returns `"sg"`, `"pl"`, or `None`), mapping
  `{1sg,2sg,3sg,1isg,2isg,3isg,sg} → "sg"`, `{1pl,2pl,3pl,pl} → "pl"`,
  `inv`/none → `None`. New `inflection_status` value `"agreement-mismatch"`,
  added to the dropped set at `build_surface_clues.py:~204`.

- [ ] **Step 1: Write the failing test** in a new
`scripts/clue_generation/test_build_surface_clues_agreement.py`:

```python
# Surface 'posè' (ipre 1isg of poser, singular) with a plural-inflected
# clue head must be dropped, not shipped.
def test_singular_inversion_surface_with_plural_clue_is_dropped(real_index):
    # source lemma-form clue head 'placer'; surface tags carry 1isg.
    surface_tags = {"ipre", "1isg", "v1_itxq__a"}
    # The inflater currently yields a 3pl head ('Placent') for these.
    status = classify_inflection("Place", surface_tags, real_index)  # helper under test
    assert status == "agreement-mismatch"
```

(If `build_surface_clues` has no extractable unit seam, add a small pure
helper `classify_inflection(source_clue, surface_tags, index) -> status`
that wraps the inflate-then-check logic, and call it from `main()`.)

- [ ] **Step 2: Run, verify it fails**

Run: `pytest scripts/clue_generation/test_build_surface_clues_agreement.py -v`
Expected: FAIL (helper missing / returns "inflected").

- [ ] **Step 3: Implement** the agreement check. After
`res = inflect_clue(source_clue, norm_tags, index)` (line ~162), derive the
inflected head's number via grammalecte and compare to the surface number:

```python
def _verb_number(tags):
    t = set(tags)
    if t & {"1sg", "2sg", "3sg", "1isg", "2isg", "3isg", "sg"}:
        return "sg"
    if t & {"1pl", "2pl", "3pl", "pl"}:
        return "pl"
    return None

def _inflected_head_number(text, index):
    for tok in re.findall(r"[\wÀ-ÿŒœŸ]+", text):
        for _lemma, tags in index.lookup_form(tok.lower()):
            n = _verb_number(tags)
            if n:
                return n
    return None
```

Wire it: if both `surf_n = _verb_number(winner_tags)` and
`head_n = _inflected_head_number(res.text, index)` are non-None and differ,
set `status = "agreement-mismatch"`. Add `"agreement-mismatch"` to the
`skipped` tuple at line ~204 so it drops to `surface_clues_dropped.csv`.

- [ ] **Step 4: Run, verify pass** + no regression on the surface build's
existing tests.

Run: `pytest scripts/clue_generation/ scripts/eval/ -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/clue_generation/build_surface_clues.py scripts/clue_generation/test_build_surface_clues_agreement.py
git commit -s -m "feat(clue-ai): drop surface clues whose number disagrees with the answer"
```

### Task 1.3 — Runtime guard over the committed wordlist

**Interfaces:**
- Consumes: `_strip_accents`, `_find_lemma_family_leak` (Task 1.1);
  `_verb_number` / head-number helper (Task 1.2). Reads
  `grid/infrastructure/src/main/resources/words/words-fr.csv`.

- [ ] **Step 1: Write the test** `scripts/eval/test_runtime_csv_agreement.py`
mirroring `test_runtime_csv_pleonasms.py`: load the shipped CSV, for each
verbal row assert the clue's head number agrees with the surface's number,
and assert no row trips `_find_lemma_family_leak` (diacritic-folded). Skip
gracefully if the lexique is absent (env artifact).

- [ ] **Step 2: Run — it should FAIL on today's CSV** (proves the guard
catches the live `posè`/`réprimè`/`ainée` rows before the scrub).

Run: `pytest scripts/eval/test_runtime_csv_agreement.py -v` → FAIL listing
the offending rows.

- [ ] **Step 3: Scrub the CSV.** Re-run the production surface build +
merge so the offending rows go blank:

```bash
python scripts/clue_generation/build_surface_clues.py
python scripts/clue_generation/merge_clues_into_wordlist.py
```

If the production inputs (`data/eval/production/*`) aren't present in the
checkout, instead apply the gates directly over the committed CSV with a
one-off scrub that blanks any row failing the two guards, then re-run the
guard. Verify `posè`,`réprimè`,`situè`,`disposè`,`insérè` and unaccented
`ainé/ainée/ainés/ainées` now have empty clue fields.

- [ ] **Step 4: Run, verify pass**

Run: `pytest scripts/eval/ -q` → PASS (new guard + existing pleonasm/finite
guards green).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/test_runtime_csv_agreement.py grid/infrastructure/src/main/resources/words/words-fr.csv
git commit -s -m "feat(clue-ai): runtime guard for clue/surface agreement + scrub words-fr.csv"
```

**Wave 1 done-when:** `pytest scripts/eval/ scripts/clue_generation/` green;
the four target rows (except `rai`, intentionally kept) ship empty clues;
PR ≤400 non-generated lines; §6a LGTM + CI green → merge.

---

## Wave 2 — Accent-collision: highest-frequency wins (`grid/infrastructure`, Kotlin)

**One PR.** Scope: `fix(grid-infrastructure): keep highest-freq variant on
accent collision`. Run `scripts/adr-context.sh grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt`.

**Files:**
- Modify: `CsvWordRepository.kt:~192-224` (`frenchFromClasspath` merge loop)
- Test: the existing `CsvWordRepository` test (Testcontainers not needed —
  classpath CSV / in-memory).

**Interfaces:**
- Consumes: `WordWithFreq` pairs already sorted by frequency descending
  (line 195). Produces: same `CsvWordRepository`, but `byText` collisions
  resolve to the highest-frequency variant's `Word`, with the colliding
  variants' clues merged in (highest-freq clue primary).

- [ ] **Step 1: Write the failing test** — feed a small fixture CSV (or
construct `Word`s) where `pose` (freq 8_300_000, clue "Place") and `posè`
(freq 97, clue "Placent") both fold to `POSE`. Assert
`repo.byText["POSE"].clues.first().text == "Place"` and that "Placent" is
either merged after or absent — not the primary.

- [ ] **Step 2: Run, verify it fails** — today the lower-freq `posè`
("Placent") wins (last-write-wins after desc sort).

- [ ] **Step 3: Implement** — change the collision `put` to keep the
first-seen (highest-freq, since sorted desc) and append later variants'
clues:

```kotlin
for (w in mainWords) {
    val themed = overlay[w.text]
    val base = byText[w.text]
    val merged = when {
        base != null -> base.copy(clues = base.clues + w.clues) // keep highest-freq primary
        themed != null -> Word(w.text, w.clues + themed.clues, w.lemma)
        else -> w
    }
    byText[w.text] = merged
}
```

(Adjust to the actual `Word` shape; `mainWords` is already freq-desc so the
first occurrence is the highest-freq.) Keep the overlay-merge behavior intact.

- [ ] **Step 4: Run, verify pass** + Konsist/arch + `:grid:infrastructure:test`.

Run: `./gradlew :grid:infrastructure:test --parallel`

- [ ] **Step 5: Commit**

```bash
git commit -s -m "fix(grid-infrastructure): keep highest-freq variant on accent collision"
```

**Wave 2 done-when:** test green, Konsist green, §6a LGTM + CI → merge.

---

## Wave 3 — Collision-safe daily regeneration (unique puzzleId)

ADR-gated. **Three PRs.**

### PR 3a — ADR-0080 (governance)

**Files:** Create `docs/adr/0080-daily-puzzle-unique-identity.md`; modify
`docs/adr/INDEX.md` (registry-coherence gate).

- [ ] Write ADR-0080 (template in CLAUDE.md): Context = deterministic
  `puzzleId` from date freezes regeneration collisions onto stored progress
  (spec §1.3); Decision = each generation gets a fresh UUID, "today" resolves
  date→most-recent row; Consequences = a `puzzle_date` column + resolver
  replace the deterministic id; multiplayer preserved via lobby-pinned id +
  server resolution; orphaned rows GC deferred.
- [ ] Add the INDEX.md line mapping the persistence/route/worker paths to
  ADR-0080.
- [ ] Commit `docs(adr): ADR-0080 daily-puzzle unique identity`; §6a LGTM → merge.

### PR 3b — Schema + resolver (expand)

**Files:**
- Create: `grid/api/src/main/resources/db/migration/V7__puzzle_date.sql`
  (mirror into the infrastructure test migration dir)
- Modify: `PuzzleRepository` (port) + its JDBC adapter — add
  `getCurrentForDate(date): StoredPuzzle?` and
  `findCurrentSummariesByDates(dates): List<StoredSummary>`; generation
  inserts a fresh `UUID.randomUUID()` stamped with `puzzle_date`.
- Modify: `PuzzleRoute.kt:111` (daily GET → `getCurrentForDate`),
  `ListDailyPuzzlesUseCase.kt:32-34` (→ current-by-date), and the
  generation/persist path to stamp `puzzle_date` + random id.
- Tests: Testcontainers repo tests; route test.

**Interfaces:**
- Produces: `PuzzleRepository.getCurrentForDate(date: LocalDate): StoredPuzzle?`
  (latest `created_at` for `puzzle_date = date`); persistence stamps
  `puzzle_date` and a random `puzzle_id`.

- [ ] **Migration (expand-and-contract):**

```sql
ALTER TABLE puzzles ADD COLUMN puzzle_date DATE;
CREATE INDEX idx_puzzles_date_created ON puzzles (puzzle_date, created_at DESC);
-- backfill existing daily rows; date is recoverable from the v7 id's
-- 48-bit ms timestamp (UTC midnight) — see DailyPuzzleSelector.
UPDATE puzzles SET puzzle_date = ((( (('x'||lpad(...)) )))) WHERE puzzle_date IS NULL;
```

(Backfill: derive the date from the existing deterministic v7 id timestamp,
or from `created_at::date` if simpler and acceptable for the archive.
Confirm against `DailyPuzzleSelector.deterministicUuidV7` before writing the
exact expression.)

- [ ] **Test (newest-wins):** insert two rows for the same `puzzle_date`
with different `created_at`; assert `getCurrentForDate` returns the newer.
- [ ] **Test (route):** daily GET returns the latest row's grid + its id.
- [ ] Implement port + adapter + route/list/persist changes; keep
  `DailyPuzzleSelector.gridNumberForDate`/`difficultyForDate` unchanged.
- [ ] `./gradlew :grid:application:test :grid:infrastructure:test :grid:api:test`
  + Konsist green.
- [ ] Commit `feat(grid): resolve daily puzzle by date→latest (ADR-0080)`.

### PR 3c — Regenerate path + worker subcommand (contract)

**Files:**
- Modify: `EnsureUpcomingDailiesUseCase.kt:46` — idempotency becomes "a
  current row exists for date?"; add a `force` mode that appends a fresh row
  even when one exists.
- Modify: `grid/worker/.../Main.kt` — add `regenerate-dailies` subcommand
  (today + upcoming window) wiring the force path.
- Tests: use-case test (force appends new id; non-force skips existing).

- [ ] **Test:** with an existing current row for today, `force=true` inserts
  a new row with a different id and same `puzzle_date`; `force=false` skips.
- [ ] Implement the force path + Clikt subcommand; structured logging only.
- [ ] `./gradlew :grid:application:test :grid:worker:test` + Konsist green.
- [ ] Commit `feat(grid-worker): regenerate-dailies subcommand (today + window)`.
- [ ] Remove the now-dead deterministic-id identity path (contract step) if
  fully superseded; keep `gridNumberForDate`.

**Wave 3 done-when:** all three PRs merged in order, each §6a LGTM + CI green.

---

## Operational tail (after all waves merge + deploy)

- [ ] Confirm `grid-api` + worker images redeployed from main (corrected CSV
  baked in).
- [ ] Run `regenerate-dailies` (today + window) in-cluster → fresh ids,
  corrected grids. Returning players reload onto a new id with a clean board.
- [ ] Spot-check `GET https://api.wordsparrow.io/v1/puzzles/daily`: none of
  `Placent`/`Font cesser`/`L'aîné` present; `Rayon lumineux` may remain (kept).

## Self-review notes

- Spec §3 W1/W2/W3 ↔ Waves 1/2/3: covered. §4 tail ↔ Operational tail.
- `rai` kept (spec §6) — guard tests must not assert on it.
- Backfill expression in 3b is the one UNVALIDATED detail — flagged inline;
  confirm the v7-timestamp decode against `DailyPuzzleSelector` before
  writing the migration, or fall back to `created_at::date`.
