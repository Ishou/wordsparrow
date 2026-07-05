# Compound (hyphenated) words in grids — design

**Date:** 2026-07-05
**Status:** Shipped 2026-07-05 — implemented via ADR-0096 (#1408) + #1409 + #1402
**Bounded contexts:** `grid/` (domain, infrastructure, api), `frontend/`, plus the
`scripts/clue_generation/` data pipeline.
**Governing ADRs:** ADR-0039 (grid generator), ADR-0058 (data-license posture),
ADR-0076/0084 (answer tokens / validation), ADR-0087 (Command-R clue lane),
ADR-0050 (a11y). Introduces **ADR-0096** (this design's decision record).

## Problem

WordSparrow grids cannot contain compound French entries. In *mots fléchés*,
hyphenated headwords like `ARC-EN-CIEL`, `PEUT-ÊTRE`, `C-À-D` are common, and a
player needs to *see where the hyphen falls* to guess the word — but the hyphen
is not a fillable cell. Today the entire pipeline enforces a hard "one A-Z letter
per cell" invariant and **silently drops** any entry containing a non-A-Z
character at ingest, so compounds never survive into a grid.

Scope of this design: **hyphenated compounds only**. Multi-word (space-separated)
locutions and apostrophe elisions are explicitly out of scope.

## Key finding: only ingest + display are missing

A survey of the pipeline (2026-07-05) established that the generator and validator
already operate on a **separator-free A-Z letter run**:

- `HmacAnswerTokenMinter.kt:46` normalises answers with `.filter { it in 'A'..'Z' }`,
  so the correctness HMAC is *already* computed over the hyphen-free run.
- Grid placement (`CellArray`, `WordSlot`, `Lexicon` bitmask domains, per-position
  intersection in `CsvWordRepository`) key on a single `Char` per cell — a compound
  is just a longer A-Z word to them.

What is missing is only:

1. **Ingest** — `CsvWordRepository.kt:321` (`if (!folded.all { it in 'A'..'Z' })
   return null`) *drops* hyphenated rows instead of *transforming* them. The
   extraction scripts drop them even earlier via `.isalpha()`
   (`scripts/clue_generation/run_production.sh:84`,
   `propagate_editorial_clues.py:153`).
2. **Display metadata** — there is no field anywhere to remember where the hyphens
   were, so the frontend cannot draw them.

Therefore the change is: **stop dropping; fold the hyphen out; remember its
position; carry that position to the frontend; render it in the inter-cell gap.**
Placement, crossing, and validation code do not change.

## Data-license posture (ADR-0058)

The shipped `grid/infrastructure/src/main/resources/words/words-fr.csv` is
~118.6k rows sourced from the **Grammalecte / Dicollecte** lexique
(`lexique-grammalecte-fr-v7.7.txt`, downloaded at build time) under the
**MPL-2.0** license option — the same corpus family as Hunspell-fr, which
ADR-0058 marks **redistributable with notice**. The lexique file itself is not
committed; only the extracted, clue-annotated CSV ships. Re-extracting the
*hyphenated* headwords from that same MPL-2.0 lexique is therefore consistent
with what we already redistribute. Clues are not in the lexique — they are
AI-generated (ADR-0087) — so every re-extracted compound still needs a clue.

## Design

### Representation: `separators`

A compound is stored end-to-end as its **A-Z letter run** plus a list of
**separator offsets**. Each offset is the index in the letter run at which a
hyphen *precedes* that cell.

```
surface   ARC-EN-CIEL
folded     A R C E N C I E L      (9 letter cells, indices 0..8)
sep offset       ^3  ^5           separators = [3, 5]
```

`separators = [3, 5]` means: render a hyphen between cell 2↔3 and between cell
4↔5. An empty/absent list is a plain (non-compound) word — fully backward
compatible.

**Invariants** (enforced at construction and validated on ingest):

- every offset ∈ `1 .. length-1` (no leading or trailing hyphen);
- strictly increasing (distinct + in-range ⇒ rejects `arc--en`-style doubles and
  duplicate offsets);
- the letter run (`text`) remains all A-Z — unchanged invariant.

### W0 — ADR-0096 (leads)

Record the decision: separator-preserving ingest, `separators` offset metadata on
the answer, inter-cell hyphen rendering, hyphen-only scope, MPL-2.0 re-extraction
posture. Update `docs/adr/INDEX.md` (registry-coherence gate) with the new
binding paths (`Word.kt`, `CsvWordRepository.kt`, `openapi.yaml` `Clue`,
frontend grid render). No code in this workstream.

### W1 — Schema-only (`grid/api/openapi.yaml`)

**Placement decision (resolved against the code):** the frontend does **not**
consume the wire `clues[]` array — it derives each word's cells by walking from
the `DefinitionCell` along its `arrow` (`useGridNavigation.ts:171-204`, fed by
`mapper.ts` `toClue`). Putting `separators` on `Clue` would mean resurrecting a
dead array on the client. So `separators` rides on **`DefinitionCell`**, which is
1:1 with a directional clue (`position` + `clueId` + `arrow`) and already flows
into the client's per-word walk. This is DRY (one consumed source) and semantically
consistent — `arrow` already describes answer *flow*, `separators` describes answer
*segmentation*, both on the same cell.

Add to the `DefinitionCell` schema:

```yaml
separators:
  type: array
  description: |
    Offsets into the answer's letter cells at which a hyphen precedes the cell,
    for hyphenated compound answers (e.g. ARC-EN-CIEL → [3, 5]). Absent or empty
    for plain words. Each value is 1..(answer length - 1), strictly increasing.
    The hyphen renders in the inter-cell gap along the cell's `arrow`; it is not a
    fillable cell and does not affect answer length or validation.
  items:
    type: integer
    minimum: 1
  default: []
```

`separators` is optional and additive — the `openapi-typescript-drift` regen
updates `frontend/src/infrastructure/api/grid/types.ts`. Schema-only PR merges
first (ADR-0001 §3), then producer (W3) and consumer (W4) land in parallel. The
`Clue` schema is left unchanged (its `separators` are unused; YAGNI).

### W2 — Domain + ingest (`grid/` domain + infrastructure)

**`Word.kt`:**
- Add `val separators: List<Int>` (default `emptyList()`).
- Add `init` requires: each offset in `1..text.length-1`, strictly increasing.
- Add a constructor path that accepts a raw surface possibly containing interior
  hyphens: fold the hyphens out to produce the A-Z `text`, compute offsets, and
  fold `lemma` the same way. The existing A-Z requirement on `text` still holds
  *after* folding.

**`CsvWordRepository.kt`:**
- Replace the `:321` drop with a transform: extract interior hyphens from the
  folded surface, compute offsets, and build the `Word` with `separators`. Rows
  with a *non-hyphen* non-A-Z char (space, apostrophe, digit), or a leading/
  trailing/double hyphen, still drop.
- The per-length / per-position intersection indexes
  (`byLengthPosLetter`, `findByLengthAndPattern`, `lettersAtPosition`) are keyed
  on the folded `text` and need no change.
- CSV format is unchanged: the hyphenated surface lives in the existing `word`
  column; offsets are derived at load (no new column).

**Placement → clue mapping:** thread `Word.separators` through the placement so
the API builder can read it (see W3). Placement/generation logic itself is
unchanged.

**Tests:** property-based round-trip (`surface ↔ folded text + separators`);
loader test with a hyphenated fixture (`arc-en-ciel`); rejection tests
(`-abc`, `abc-`, `a--b`, `a b`, `l'eau`); `Word` invariant tests. Domain logic
targets near-100% mutation coverage (CLAUDE.md TDD rule).

### W3 — API wiring (`grid/api`)

Emit `separators = placement.word.separators` on `DefinitionCellDto` in
`GridToPuzzleMapper.buildCells` (`GridToPuzzleMapper.kt:101-107`, where the
`placement` is already resolved for the `clueId`). Add the field to
`DefinitionCellDto`. Empty list serialises as `[]`. Add a **wire-shape contract
test** asserting a compound definition cell carries the expected offsets — this
is the class of gap that let #1170 break co-op silently (ADR-0084 lesson).

### W4 — Frontend render (`frontend/`)

Cells are laid out by a CSS grid with `gap: 5px` inside a `position: relative`
`boardWrap` (`PuzzleBoard.tsx:314-357`); there is no per-cell absolute position.
Separator offsets arrive on the `DefinitionCell`, flow through `mapper.ts`
`toClue` into the domain sub-clue, and index into the `cells` array the client
already walks in `useGridNavigation.ts:181-188`. Draw the hyphen via an **absolute
overlay** (the pattern already used for the reveal animation at
`PuzzleBoard.tsx:219`): a hyphen between `cells[k-1]` and `cells[k]` sits at
`left = col * STRIDE + CELL`, `top = row * STRIDE` for `across` (a vertical bar in
the row gap for `down`), using `STRIDE`/`CELL`/`GAP` from `playLayout.ts`. Because
the marker is axis-bound, an across and a down compound touching the same cell
render in different gaps and never collide.

- The hyphen is presentation-only; cells stay single-letter inputs
  (`letterNormalize.ts`, `usePuzzleValidation.ts` unchanged — the player still
  types `length` letters).
- **a11y (ADR-0050):** the hyphen must not be a purely visual cue. Announce it —
  e.g. a visually-hidden "trait d'union" in the word's accessible name, or an
  `aria` annotation on the affected cell pair — so screen-reader users learn the
  segmentation. Covered by `pnpm a11y`.
- Where an answer is shown as joined text (word-reveal, minigame), render the
  hyphens inline (`ARC-EN-CIEL`).

**Tests:** component test for gap placement across/down; a11y assertion; a
Playwright check that a seeded compound puzzle shows the marker.

### W5 — Data (heavy; lands after plumbing)

Governed by ADR-0087. Relax the `.isalpha()` filters
(`run_production.sh:84`, `propagate_editorial_clues.py:153`) to allow *interior*
hyphens, extract hyphenated headwords from the Grammalecte lexique, run them
through the Command-R clue batch + `pipeline_v2` gates + LLM judge, and
regenerate `words-fr.csv` with the compound rows (hyphen in the `word` column).
Until W5 lands, plumbing is exercised by a small hand-authored seed set of
compounds with clues (bliss/CC0), which also becomes permanent test-fixture data.

## Sequencing & dependencies

```
W0 (ADR) ──▶ W1 (schema) ──▶ W3 (api producer) ─┐
   │                     └──▶ W4 (frontend)      │
   └────────▶ W2 (domain+ingest) ───────────────┴──▶ W5 (data, last)
```

Land **W0–W4 with the seed set first** (fully testable, de-risked), then **W5**.
This orders the heaviest/riskiest piece last without dropping full re-extraction.

## Non-goals

- Multi-word (space-separated) locutions; apostrophe elisions; accented-glyph
  cells. (Accents are already folded for cells; only hyphen segmentation is added.)
- Any change to grid generation heuristics, interlock rules, or the HMAC
  validation path.
- Player-typed hyphens — the hyphen is never a keystroke or a cell.
- Enumeration-style clue hints (e.g. "(3-2-4)").

## Testing summary

- **Domain (W2):** property-based round-trip + invariants; near-100% mutation.
- **Ingest (W2):** loader fixture + rejection matrix.
- **API (W3):** wire-shape contract test for `Clue.separators`.
- **Frontend (W4):** gap-placement component tests (across/down), a11y, e2e.
- **Data (W5):** pipeline_v2 gates + LLM judge (existing clue-quality harness).
