# Compound (hyphenated) words in grids — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let WordSparrow grids contain hyphenated compound answers (ARC-EN-CIEL, PEUT-ÊTRE), placed as contiguous letter cells with the hyphen rendered as a visible marker *between* cells.

**Architecture:** The grid stores every answer as a separator-free A-Z letter run (unchanged); a new `separators: List<Int>` offset list rides alongside as pure display metadata. Ingest folds interior hyphens out of the surface into offsets instead of dropping the row; the offsets flow domain → `DefinitionCell` wire field → frontend, which draws a hyphen in the existing 5px inter-cell gap. Generation, intersection, and HMAC validation are untouched — they only ever see the A-Z run.

**Tech Stack:** Kotlin 2.3 + Ktor (grid/), JUnit 5 + assertk + Kotest property (`io.kotest.property`); OpenAPI YAML + `openapi-typescript`; React 19 + Panda CSS + Vitest + Playwright (frontend/).

**Scope:** This plan covers the plumbing (W0–W4) plus a small hand-authored seed set so real grids can contain compounds. **W5 (Grammalecte re-extraction + Command-R clue batch)** is a separate data-pipeline plan and is out of scope here. Spec: `docs/superpowers/specs/2026-07-05-compound-words-in-grids-design.md`.

## Global Constraints

- **Separator invariant:** each offset ∈ `1..(letterRun.length - 1)`, strictly increasing. Scope is hyphen-only — spaces, apostrophes, digits still drop at ingest.
- **A-Z cell invariant unchanged:** `Word.text` and `Word.lemma` remain all-`A-Z`; the hyphen is never a cell and never a keystroke.
- **Validation/placement untouched:** no edits to `HmacAnswerTokenMinter`, `CellArray`, `Lexicon`, `BitmaskCsp`, `WordSlot`, or the per-position intersection indexes.
- **Backward compatible:** `separators` defaults to `[]`; plain words and existing puzzles are unaffected. Schema field is optional/additive (`default: []`).
- **Repo rules:** conventional commits with bounded-context scope, `git commit -s` (DCO), 400-line diff cap per PR, schema-only PR merges before producer/consumer (ADR-0001 §3), near-100% mutation coverage on domain logic, WCAG AA (ADR-0050), no `println`/`console.log`, one-line WHY comments only.
- **PR/merge order:** Task 1 (ADR) → Task 2 (schema) merge first; then Tasks 3–6 (domain/data), Task 7 (api producer), Tasks 8–10 (frontend consumer) can proceed. Each task group below notes its bounded context and target PR.

---

### Task 1: ADR-0096 + INDEX registry (W0)

**Bounded context:** docs · **PR:** `docs(grid): ADR-0096 compound words` (merges first)

**Files:**
- Create: `docs/adr/0096-compound-hyphenated-words.md`
- Modify: `docs/adr/INDEX.md`

**Interfaces:**
- Produces: the binding decision every later task cites; no code symbols.

- [ ] **Step 1: Write the ADR** using the CLAUDE.md template.

```markdown
# ADR-0096: Compound (hyphenated) words in grids

## Status
Accepted

## Context
Mots fléchés commonly use hyphenated headwords (ARC-EN-CIEL, PEUT-ÊTRE). The
grid pipeline enforces one A-Z letter per cell and silently drops any entry with
a non-A-Z char at ingest (`CsvWordRepository.kt:321`, and `.isalpha()` in the
extraction scripts), so compounds never survive. Placement, crossing, and HMAC
validation already operate on a separator-free A-Z run
(`HmacAnswerTokenMinter.kt:46` filters to A-Z), so only *ingest* and *display*
are missing.

## Decision
- Represent a compound as its A-Z letter run plus `separators: List<Int>` —
  offsets at which a hyphen precedes that cell (ARC-EN-CIEL → `ARCENCIEL`, `[3,5]`).
- Ingest folds interior hyphens into offsets instead of dropping the row; other
  non-A-Z chars (space, apostrophe, digit) still drop. Scope: hyphen only.
- Surface offsets on the `DefinitionCell` wire field (the frontend consumes
  definition cells, not the `clues[]` array); render the hyphen in the inter-cell
  gap along the arrow axis. It is never a fillable cell or a keystroke.
- Generation, intersection, and HMAC validation are unchanged.
- Data provenance: hyphenated headwords may be re-extracted from the Grammalecte/
  Dicollecte lexique already shipped under MPL-2.0 (ADR-0058); clues are authored
  or generated (ADR-0087). A small hand-authored CC0 seed set ships first.

## Consequences
Easier: compounds become first-class grid answers; longer-word corpus coverage
improves CSP fill. Harder: the frontend gains an inter-cell overlay concern and
an a11y announcement. Unchanged: cell model, validation, generation heuristics.
```

- [ ] **Step 2: Register in INDEX.md** — add rows mapping the new binding paths to ADR-0096.

Add under the appropriate section of `docs/adr/INDEX.md`:

```
ADR-0096  grid/domain/src/main/kotlin/com/bliss/grid/domain/model/Word.kt  Word.separators: A-Z letter run + hyphen offset metadata (1..len-1, strictly increasing); compound display only, not cells/validation
ADR-0096  grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt  Ingest folds interior hyphens into separator offsets (was: drop non-A-Z); other non-A-Z chars still drop
ADR-0096  grid/api/openapi.yaml  DefinitionCell.separators (offsets, default []); Clue unchanged
ADR-0096  frontend/src/ui/components/grid/PuzzleBoard.tsx  Hyphen overlay drawn in the inter-cell GAP along the arrow axis
```

- [ ] **Step 3: Verify INDEX coherence** — Run: `grep -c "ADR-0096" docs/adr/INDEX.md`. Expected: `4`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0096-compound-hyphenated-words.md docs/adr/INDEX.md
git commit -s -m "docs(grid): ADR-0096 compound (hyphenated) words in grids"
```

---

### Task 2: Schema — `DefinitionCell.separators` + regen types (W1)

**Bounded context:** grid/api · **PR:** `feat(api-grid): DefinitionCell.separators` (schema-only, merges before Tasks 7–10)

**Files:**
- Modify: `grid/api/openapi.yaml` (DefinitionCell schema, ~line 989-1010)
- Modify (generated): `frontend/src/infrastructure/api/grid/types.ts`

**Interfaces:**
- Produces: wire field `DefinitionCell.separators?: number[]` consumed by Task 7 (producer) and Task 8 (frontend).

- [ ] **Step 1: Add the field to the `DefinitionCell` schema.** After the `arrow` property (openapi.yaml ~line 1010):

```yaml
        arrow:
          $ref: '#/components/schemas/Arrow'
        separators:
          type: array
          default: []
          description: |
            Offsets into this clue's answer letter cells at which a hyphen
            precedes the cell, for hyphenated compound answers
            (e.g. ARC-EN-CIEL → [3, 5]). Absent or empty for plain words. Each
            value is 1..(answer length - 1), strictly increasing. The hyphen
            renders in the inter-cell gap along `arrow`; it is not a fillable
            cell and does not affect answer length or validation.
          items:
            type: integer
            minimum: 1
```

(`separators` stays out of `required` — additive/optional.)

- [ ] **Step 2: Lint the schema.** Run: `npx --prefix frontend @redocly/cli lint grid/api/openapi.yaml` (or the repo's `openapi-lint` invocation). Expected: no new errors.

- [ ] **Step 3: Regenerate frontend types.** Run from `frontend/`: `pnpm api:check`. Expected: `types.ts` updates so `components['schemas']['DefinitionCell']` gains `separators?: number[]`; the drift gate passes.

- [ ] **Step 4: Verify the generated field.** Run: `grep -n "separators" frontend/src/infrastructure/api/grid/types.ts`. Expected: a `separators?: number[];` line under the DefinitionCell schema block.

- [ ] **Step 5: Commit**

```bash
git add grid/api/openapi.yaml frontend/src/infrastructure/api/grid/types.ts
git commit -s -m "feat(api-grid): add DefinitionCell.separators for compound words"
```

---

### Task 3: Domain — `HyphenSurface.split` (W2)

**Bounded context:** grid/domain · **PR:** `feat(grid-domain): compound word separators` (with Tasks 4–5)

**Files:**
- Create: `grid/domain/src/main/kotlin/com/bliss/grid/domain/model/HyphenSurface.kt`
- Test: `grid/domain/src/test/kotlin/com/bliss/grid/domain/model/HyphenSurfaceTest.kt`

**Interfaces:**
- Produces: `HyphenSurface.split(surface: String): Pair<String, List<Int>>?` — returns `(letterRun, offsets)` or `null` when the surface has a non-(A-Z or hyphen) char, or a leading/trailing/doubled hyphen. Consumed by Task 4 (Word factory) and Task 5 (loader).

- [ ] **Step 1: Write the failing tests.**

```kotlin
package com.bliss.grid.domain.model

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import io.kotest.property.Arb
import io.kotest.property.arbitrary.stringPattern
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

class HyphenSurfaceTest {
    @Test
    fun `plain word has no separators`() {
        assertThat(HyphenSurface.split("CHAT")).isEqualTo("CHAT" to emptyList<Int>())
    }

    @Test
    fun `single hyphen yields one offset at the following cell`() {
        assertThat(HyphenSurface.split("PEUT-ETRE")).isEqualTo("PEUTETRE" to listOf(4))
    }

    @Test
    fun `multiple hyphens yield increasing offsets`() {
        assertThat(HyphenSurface.split("ARC-EN-CIEL")).isEqualTo("ARCENCIEL" to listOf(3, 5))
    }

    @Test
    fun `leading hyphen is rejected`() {
        assertThat(HyphenSurface.split("-ABC")).isNull()
    }

    @Test
    fun `trailing hyphen is rejected`() {
        assertThat(HyphenSurface.split("ABC-")).isNull()
    }

    @Test
    fun `doubled hyphen is rejected`() {
        assertThat(HyphenSurface.split("A--B")).isNull()
    }

    @Test
    fun `non-letter non-hyphen char is rejected`() {
        assertThat(HyphenSurface.split("A B")).isNull()
        assertThat(HyphenSurface.split("L'EAU")).isNull()
        assertThat(HyphenSurface.split("CH1T")).isNull()
    }

    @Test
    fun `round-trip - reinserting hyphens at offsets rebuilds the surface`() {
        runBlocking {
            checkAll(Arb.stringPattern("[A-Z]-?[A-Z]([A-Z]|-[A-Z]){0,8}")) { raw ->
                val result = HyphenSurface.split(raw)
                if (result != null) {
                    val (letters, seps) = result
                    val rebuilt = buildString {
                        letters.forEachIndexed { i, ch ->
                            if (i in seps) append('-')
                            append(ch)
                        }
                    }
                    assertThat(rebuilt).isEqualTo(raw)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `./gradlew :grid:domain:test --tests '*HyphenSurfaceTest*'`
Expected: FAIL — `HyphenSurface` unresolved reference.

- [ ] **Step 3: Write the implementation.**

```kotlin
package com.bliss.grid.domain.model

/**
 * Folds an uppercase surface of A-Z letters and interior hyphens into a
 * separator-free letter run plus the offsets where a hyphen precedes a cell.
 */
object HyphenSurface {
    fun split(surface: String): Pair<String, List<Int>>? {
        val letters = StringBuilder()
        val offsets = mutableListOf<Int>()
        for (ch in surface) {
            when {
                ch in 'A'..'Z' -> letters.append(ch)
                ch == '-' -> {
                    val offset = letters.length
                    if (offset == 0 || offsets.lastOrNull() == offset) return null
                    offsets.add(offset)
                }
                else -> return null
            }
        }
        if (letters.isEmpty() || offsets.lastOrNull() == letters.length) return null
        return letters.toString() to offsets.toList()
    }
}
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `./gradlew :grid:domain:test --tests '*HyphenSurfaceTest*'`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add grid/domain/src/main/kotlin/com/bliss/grid/domain/model/HyphenSurface.kt \
        grid/domain/src/test/kotlin/com/bliss/grid/domain/model/HyphenSurfaceTest.kt
git commit -s -m "feat(grid-domain): fold hyphenated surface into separator offsets"
```

---

### Task 4: Domain — `Word.separators` field + factory (W2)

**Bounded context:** grid/domain · **PR:** same as Task 3

**Files:**
- Modify: `grid/domain/src/main/kotlin/com/bliss/grid/domain/model/Word.kt`
- Test: `grid/domain/src/test/kotlin/com/bliss/grid/domain/model/WordTest.kt`

**Interfaces:**
- Consumes: `HyphenSurface.split` (Task 3).
- Produces: `Word.separators: List<Int>` (default `emptyList()`); a `Word.fromSurface(text, definition, lemma?, theme?)` factory that hyphen-folds `text` and `lemma`. `WordPlacement.word.separators` becomes reachable at the API mapper (Task 7).

- [ ] **Step 1: Write the failing tests** (append to `WordTest.kt`).

```kotlin
    @Test
    fun `Word defaults to no separators`() {
        assertThat(Word("CHAT", "x").separators).isEqualTo(emptyList<Int>())
    }

    @Test
    fun `fromSurface folds hyphens into separators and keeps an A-Z letter run`() {
        val w = Word.fromSurface("arc-en-ciel", "Phénomène coloré")
        assertThat(w.text).isEqualTo("ARCENCIEL")
        assertThat(w.separators).isEqualTo(listOf(3, 5))
    }

    @Test
    fun `fromSurface folds hyphens out of the lemma too`() {
        val w = Word.fromSurface("arc-en-ciel", "x", lemma = "arc-en-ciel")
        assertThat(w.lemma).isEqualTo("ARCENCIEL")
    }

    @Test
    fun `Word rejects a separator offset out of range`() {
        assertFailure { Word.of("ABC", "x", separators = listOf(3)) }
    }

    @Test
    fun `Word rejects non-increasing separators`() {
        assertFailure { Word.of("ABCDE", "x", separators = listOf(2, 2)) }
    }
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `./gradlew :grid:domain:test --tests '*WordTest*'`
Expected: FAIL — `separators`, `fromSurface`, `of` unresolved.

- [ ] **Step 3: Implement.** Add the field, invariants, and factories to `Word.kt`.

Add `separators` to the private constructor and its `init` block:

```kotlin
data class Word private constructor(
    val text: String,
    val clues: List<WordClue>,
    val lemma: String,
    val separators: List<Int> = emptyList(),
) {
    init {
        require(text.isNotEmpty()) { "Word text must not be empty" }
        require(text.all { it in 'A'..'Z' }) { "Word text must be A-Z, was '$text'" }
        require(lemma.isNotEmpty()) { "Word lemma must not be empty (defaults to text)" }
        require(lemma.all { it in 'A'..'Z' }) { "Word lemma must be A-Z, was '$lemma'" }
        require(clues.isNotEmpty()) { "Word must carry at least one WordClue" }
        require(separators.all { it in 1 until text.length }) {
            "Word separators must be in 1..${text.length - 1}, was $separators for '$text'"
        }
        require(separators.zipWithNext().all { (a, b) -> a < b }) {
            "Word separators must be strictly increasing, was $separators"
        }
    }
```

In the `companion object`, thread `separators` through the primary `invoke` and add the two new factories:

```kotlin
        operator fun invoke(
            text: String,
            definition: String,
            lemma: String? = null,
            theme: String? = null,
            separators: List<Int> = emptyList(),
        ): Word {
            val foldedText = text.uppercase()
            return Word(
                foldedText,
                listOf(WordClue(definition, theme)),
                lemma?.uppercase() ?: foldedText,
                separators,
            )
        }

        /** Explicit-separators factory for tests and callers that pre-computed offsets. */
        fun of(
            text: String,
            definition: String,
            lemma: String? = null,
            theme: String? = null,
            separators: List<Int> = emptyList(),
        ): Word = invoke(text, definition, lemma, theme, separators)

        /** Builds a Word from a raw hyphenated surface, folding hyphens into separators. */
        fun fromSurface(
            text: String,
            definition: String,
            lemma: String? = null,
            theme: String? = null,
        ): Word {
            val (letters, separators) =
                HyphenSurface.split(text.uppercase())
                    ?: throw IllegalArgumentException("Word.fromSurface: not a hyphenated A-Z surface: '$text'")
            val foldedLemma = lemma?.let { HyphenSurface.split(it.uppercase())?.first } ?: letters
            return invoke(letters, definition, foldedLemma, theme, separators)
        }
```

(The existing `invoke(text, clues, lemma)` overload is unchanged — plain words keep `separators = emptyList()`.)

- [ ] **Step 4: Run tests to verify they pass.**

Run: `./gradlew :grid:domain:test --tests '*WordTest*'`
Expected: PASS.

- [ ] **Step 5: Run the full domain suite + Spotless** to catch arch/format regressions.

Run: `./gradlew :grid:domain:test spotlessCheck`
Expected: PASS (`spotlessApply` to fix formatting if it fails).

- [ ] **Step 6: Commit**

```bash
git add grid/domain/src/main/kotlin/com/bliss/grid/domain/model/Word.kt \
        grid/domain/src/test/kotlin/com/bliss/grid/domain/model/WordTest.kt
git commit -s -m "feat(grid-domain): Word carries hyphen separator offsets"
```

---

### Task 5: Ingest — CsvWordRepository transform (W2)

**Bounded context:** grid/infrastructure · **PR:** `feat(grid-infra): load hyphenated compound words`

**Files:**
- Modify: `grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt` (`toWordWithFreq`, lines 302-354)
- Create (fixture): `grid/infrastructure/src/test/resources/words/compound-fixture.csv`
- Test: `grid/infrastructure/src/test/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepositoryCompoundTest.kt`

**Interfaces:**
- Consumes: `HyphenSurface.split`, `Word` (Tasks 3–4).
- Produces: loaded `Word`s with populated `separators` for hyphenated rows; non-hyphen non-A-Z rows still drop.

- [ ] **Step 1: Create the fixture** `compound-fixture.csv`:

```csv
word,language,length,frequency,difficulty,clue,source,source_license,lemma
arc-en-ciel,fr,9,50000,easy,Phénomène coloré après la pluie,test,test,arc-en-ciel
chat,fr,4,90000,easy,Félin domestique,test,test,chat
c'est-à-dire,fr,10,40000,easy,Autrement dit,test,test,c'est-à-dire
```

(The `c'est-à-dire` row carries an apostrophe → must drop; `arc-en-ciel` → keep with `[3,5]`; `chat` → keep, no separators.)

- [ ] **Step 2: Write the failing test.**

```kotlin
package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isEmpty
import org.junit.jupiter.api.Test

class CsvWordRepositoryCompoundTest {
    private val repo = CsvWordRepository.fromClasspath("/words/compound-fixture.csv")

    @Test
    fun `hyphenated word loads as an A-Z run with separator offsets`() {
        val w = repo.findByLength(9).single { it.text == "ARCENCIEL" }
        assertThat(w.separators).isEqualTo(listOf(3, 5))
    }

    @Test
    fun `plain word loads with no separators`() {
        val w = repo.findByLength(4).single { it.text == "CHAT" }
        assertThat(w.separators).isEmpty()
    }

    @Test
    fun `apostrophe entry is dropped, not loaded`() {
        assertThat(repo.findByLength(10).filter { it.text.startsWith("CEST") }).isEmpty()
    }
}
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepositoryCompoundTest*'`
Expected: FAIL — `ARCENCIEL` not found (row currently dropped by the A-Z gate).

- [ ] **Step 4: Implement the transform.** In `toWordWithFreq`, replace the drop gate at lines 317-321:

Replace:

```kotlin
            val folded = foldToAscii(text)
            // Drop entries whose word can't be placed in A-Z cells ...
            if (!folded.all { it in 'A'..'Z' }) return null
```

with:

```kotlin
            val folded = foldToAscii(text)
            // Fold interior hyphens into separator offsets; keep the A-Z run for cells.
            // Non-hyphen non-A-Z chars (space, apostrophe, digit) still drop the row.
            val (letters, separators) = HyphenSurface.split(folded) ?: return null
```

Then update the lemma fold (lines 326-331) to also strip hyphens, and the `Word(...)` return (lines 344-349) to pass `letters` and `separators`:

```kotlin
            val foldedLemma =
                rawLemma
                    ?.takeIf { it.isNotBlank() }
                    ?.let(::foldToAscii)
                    ?.let { HyphenSurface.split(it)?.first }
                    ?: letters
            // theme block unchanged
            return Word(
                text = letters,
                definition = clue,
                lemma = foldedLemma,
                theme = theme,
                separators = separators,
            ) to frequency
```

Add the import: `import com.bliss.grid.domain.model.HyphenSurface`.

- [ ] **Step 5: Run tests to verify they pass.**

Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepositoryCompoundTest*'`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the infra suite + Spotless.**

Run: `./gradlew :grid:infrastructure:test spotlessCheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt \
        grid/infrastructure/src/test/resources/words/compound-fixture.csv \
        grid/infrastructure/src/test/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepositoryCompoundTest.kt
git commit -s -m "feat(grid-infra): fold hyphenated words into separators at ingest"
```

---

### Task 6: Data — CC0 compound seed set (W2/data)

**Bounded context:** grid/infrastructure (resource) · **PR:** `feat(grid-infra): seed compound words`

**Files:**
- Modify: `grid/infrastructure/src/main/resources/words/words-fr.csv` (append rows)

**Interfaces:**
- Produces: real hyphenated entries so generated grids can contain compounds (enables Task 9/10 e2e). Coexists with the existing 1.7k `bliss` rows.

- [ ] **Step 1: Append ~10 common hyphenated compounds** as `bliss`/`CC0-1.0` rows. Match the header column order exactly (`word,language,length,frequency,difficulty,clue,source,source_license,lemma`); `length` = letter-run length (hyphens excluded):

```csv
arc-en-ciel,fr,9,50000,0.4,Phénomène coloré après la pluie,bliss,CC0-1.0,arc-en-ciel
peut-être,fr,8,90000,0.3,Possiblement,bliss,CC0-1.0,peut-être
grand-père,fr,9,80000,0.3,Père du père,bliss,CC0-1.0,grand-père
belle-mère,fr,9,60000,0.4,Mère du conjoint,bliss,CC0-1.0,belle-mère
chef-lieu,fr,8,40000,0.5,Ville principale d'un département,bliss,CC0-1.0,chef-lieu
porte-clés,fr,9,45000,0.4,Anneau à clés,bliss,CC0-1.0,porte-clés
sous-marin,fr,9,55000,0.4,Navire qui plonge,bliss,CC0-1.0,sous-marin
week-end,fr,7,85000,0.3,Fin de semaine,bliss,CC0-1.0,week-end
rez-de-chaussée,fr,13,30000,0.6,Étage au niveau de la rue,bliss,CC0-1.0,rez-de-chaussée
va-et-vient,fr,8,35000,0.5,Mouvement alternatif,bliss,CC0-1.0,va-et-vient
```

- [ ] **Step 2: Verify they load and fold correctly.** Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepository*'`. Expected: PASS (existing loader tests still green; the production CSV parses).

- [ ] **Step 3: Sanity-check the fold** with a one-off (from repo root):

Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepositoryCompoundTest*'`
Expected: PASS — confirms the transform handles the same shapes as the seed rows.

- [ ] **Step 4: Commit**

```bash
git add grid/infrastructure/src/main/resources/words/words-fr.csv
git commit -s -m "feat(grid-infra): seed CC0 hyphenated compound words"
```

---

### Task 7: API producer — emit `DefinitionCellDto.separators` (W3)

**Bounded context:** grid/api · **PR:** `feat(api-grid): emit compound separators` (needs Task 2 schema merged)

**Files:**
- Modify: `grid/api/src/main/kotlin/com/bliss/grid/api/dto/PuzzleResponse.kt` (`DefinitionCellDto`)
- Modify: `grid/api/src/main/kotlin/com/bliss/grid/api/mapper/GridToPuzzleMapper.kt` (`buildCells`, lines 101-107)
- Test: `grid/api/src/test/kotlin/com/bliss/grid/api/mapper/GridToPuzzleMapperCompoundTest.kt`

**Interfaces:**
- Consumes: `WordPlacement.word.separators` (already reachable — the mapper resolves `placement` at line 98-100).
- Produces: `DefinitionCellDto.separators: List<Int>` serialised on the wire.

- [ ] **Step 1: Write the failing contract test.**

```kotlin
package com.bliss.grid.api.mapper

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.grid.api.dto.DefinitionCellDto
// Reuse the smallest grid-building helper the existing mapper tests use;
// mirror GridToPuzzleMapperTest's fixture builder for a 1-word grid.
import org.junit.jupiter.api.Test

class GridToPuzzleMapperCompoundTest {
    @Test
    fun `definition cell carries the word's separator offsets`() {
        val grid = singleWordGrid(Word.of("ARCENCIEL", "Phénomène coloré", separators = listOf(3, 5)))
        val response = GridToPuzzleMapper().toApi(grid, puzzleId, createdAt, hintsAllowed = 3)
        val def = response.cells.filterIsInstance<DefinitionCellDto>().single()
        assertThat(def.separators).isEqualTo(listOf(3, 5))
    }
}
```

(Use the same grid/placement fixture helper as `GridToPuzzleMapperTest.kt`; `singleWordGrid`, `puzzleId`, `createdAt` come from that test's existing scaffolding — copy its builder rather than inventing a new one.)

- [ ] **Step 2: Run test to verify it fails.**

Run: `./gradlew :grid:api:test --tests '*GridToPuzzleMapperCompoundTest*'`
Expected: FAIL — `DefinitionCellDto` has no `separators`.

- [ ] **Step 3: Add the field to `DefinitionCellDto`.** In `PuzzleResponse.kt`, add to the data class (default keeps existing constructors working):

```kotlin
    val separators: List<Int> = emptyList(),
```

- [ ] **Step 4: Emit it in the mapper.** In `GridToPuzzleMapper.buildCells`, extend the `DefinitionCellDto(...)` at lines 102-107:

```kotlin
                            cells +=
                                DefinitionCellDto(
                                    position = dto,
                                    clueId = clueIdByPlacement.getValue(placement),
                                    text = clue.definition,
                                    arrow = clue.direction.toApiArrow(),
                                    separators = placement.word.separators,
                                )
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `./gradlew :grid:api:test --tests '*GridToPuzzleMapperCompoundTest*'`
Expected: PASS.

- [ ] **Step 6: Run the api suite + Spotless.**

Run: `./gradlew :grid:api:test spotlessCheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add grid/api/src/main/kotlin/com/bliss/grid/api/dto/PuzzleResponse.kt \
        grid/api/src/main/kotlin/com/bliss/grid/api/mapper/GridToPuzzleMapper.kt \
        grid/api/src/test/kotlin/com/bliss/grid/api/mapper/GridToPuzzleMapperCompoundTest.kt
git commit -s -m "feat(api-grid): emit DefinitionCell.separators for compounds"
```

---

### Task 8: Frontend plumbing — thread separators into the domain clue (W4)

**Bounded context:** frontend · **PR:** `feat(frontend-grid): compound word hyphen marker` (with Tasks 9–10; needs Task 2 types)

**Files:**
- Modify: `frontend/src/domain/puzzle/Cell.ts` (`DefinitionClue`)
- Modify: `frontend/src/infrastructure/api/grid/mapper.ts` (`toClue`)
- Test: `frontend/src/infrastructure/api/grid/mapper.test.ts` (or the existing mapper test file)

**Interfaces:**
- Consumes: wire `DefinitionCell.separators` (Task 2).
- Produces: `DefinitionClue.separators: readonly number[]` on the domain clue, reachable in `useGridNavigation` as `clue.clue.separators`.

- [ ] **Step 1: Write the failing test** (append to the mapper test):

```ts
it('carries DefinitionCell.separators onto the domain clue', () => {
  const api = oneAcrossCompoundPuzzle(); // wire puzzle with a def cell separators:[3,5]
  const puzzle = apiPuzzleToDomain(api);
  const def = puzzle.cells.find((c) => c?.kind === 'definition') as DefinitionCell;
  expect(def.clues[0].separators).toEqual([3, 5]);
});
```

(Build `oneAcrossCompoundPuzzle` by copying an existing wire-puzzle fixture in the test file and adding `separators: [3, 5]` to its definition cell.)

- [ ] **Step 2: Run test to verify it fails.**

Run (from `frontend/`): `pnpm test -- mapper`
Expected: FAIL — `separators` is `undefined` on the domain clue.

- [ ] **Step 3: Add the field to the domain type.** In `Cell.ts`, extend `DefinitionClue`:

```ts
export interface DefinitionClue {
  readonly text: string;
  readonly arrow: ArrowDirection;
  // Offsets where a hyphen precedes the answer cell, for hyphenated compounds.
  readonly separators?: readonly number[];
}
```

- [ ] **Step 4: Thread it through `toClue`.** In `mapper.ts`:

```ts
const toClue = (cell: ApiDefinitionCell): DefinitionClue => ({
  text: cell.text, arrow: cell.arrow as ArrowDirection, separators: cell.separators ?? [],
});
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `pnpm test -- mapper`
Expected: PASS.

- [ ] **Step 6: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domain/puzzle/Cell.ts frontend/src/infrastructure/api/grid/mapper.ts \
        frontend/src/infrastructure/api/grid/mapper.test.ts
git commit -s -m "feat(frontend-grid): thread compound separators into the domain clue"
```

---

### Task 9: Frontend render — hyphen overlay in the inter-cell gap (W4)

**Bounded context:** frontend · **PR:** same as Task 8

**Files:**
- Create: `frontend/src/ui/components/grid/SeparatorOverlay.tsx`
- Modify: `frontend/src/ui/components/grid/PuzzleBoard.tsx` (render the overlay as a sibling of `boardGrid`, near the existing `{overlay}` at line 357)
- Modify: `frontend/src/ui/components/grid/useGridNavigation.ts` (expose the built clues if not already returned)
- Test: `frontend/src/ui/components/grid/SeparatorOverlay.test.tsx`

**Interfaces:**
- Consumes: the navigation lookup's per-clue `{ clue: { separators }, cells, direction }` (built at `useGridNavigation.ts:181-202`), and `CELL`/`GAP`/`STRIDE` from `playLayout.ts`.
- Produces: absolutely-positioned hyphen marks; presentation only (no input/nav changes).

- [ ] **Step 1: Expose the clues from the hook** (if `useGridNavigation` doesn't already return `allClues`). Add `allClues` (built at line 202) to the hook's return object, typed `readonly Clue[]`.

- [ ] **Step 2: Write the failing component test.**

```tsx
import { render } from '@testing-library/react';
import { SeparatorOverlay } from './SeparatorOverlay';
import { CELL, STRIDE } from './playLayout';

test('renders a hyphen at each across separator offset', () => {
  const clue = {
    direction: 'across' as const,
    clue: { text: 'x', arrow: 'right' as const, separators: [3, 5] },
    cells: Array.from({ length: 9 }, (_, i) => ({
      kind: 'letter' as const, position: { row: 2, col: i + 1 }, entry: '',
    })),
    definition: { kind: 'definition' as const, position: { row: 2, col: 0 }, clues: [] as never },
  };
  const { getAllByTestId } = render(<SeparatorOverlay clues={[clue]} />);
  const marks = getAllByTestId('sep-mark');
  expect(marks).toHaveLength(2);
  // First hyphen sits after cell index 2 (col 3): left = 3*STRIDE + ... anchored to the gap.
  expect(marks[0]).toHaveStyle({ left: `${(1 + 3 - 1) * STRIDE + CELL}px` });
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `pnpm test -- SeparatorOverlay`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `SeparatorOverlay.tsx`.**

```tsx
import { css } from '@styled-system/css';
import { CELL, GAP, STRIDE } from './playLayout';
import type { Clue } from './useGridNavigation';

const mark = css({
  position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'fg.muted', fontWeight: 'bold', pointerEvents: 'none', zIndex: 2,
});

// A hyphen sits in the gap before cells[offset]; the previous cell is cells[offset-1].
export function SeparatorOverlay({ clues }: { clues: readonly Clue[] }) {
  const marks = clues.flatMap((c) =>
    (c.clue.separators ?? []).flatMap((offset) => {
      const prev = c.cells[offset - 1];
      if (!prev) return [];
      const { row, col } = prev.position;
      const horizontal = c.direction === 'across';
      const left = horizontal ? col * STRIDE + CELL : col * STRIDE;
      const top = horizontal ? row * STRIDE : row * STRIDE + CELL;
      const width = horizontal ? GAP : CELL;
      const height = horizontal ? CELL : GAP;
      return [
        <span
          key={`${row},${col},${c.direction}`}
          data-testid="sep-mark"
          aria-hidden="true"
          className={mark}
          style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}
        >
          -
        </span>,
      ];
    }),
  );
  return <>{marks}</>;
}
```

- [ ] **Step 5: Wire into `PuzzleBoard.tsx`.** Render `<SeparatorOverlay clues={nav.allClues} />` inside `boardWrap` as a sibling of `boardGrid` (alongside `{overlay}` at line 357).

- [ ] **Step 6: Run test to verify it passes.**

Run: `pnpm test -- SeparatorOverlay`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm typecheck` → Expected: PASS.

```bash
git add frontend/src/ui/components/grid/SeparatorOverlay.tsx \
        frontend/src/ui/components/grid/PuzzleBoard.tsx \
        frontend/src/ui/components/grid/useGridNavigation.ts \
        frontend/src/ui/components/grid/SeparatorOverlay.test.tsx
git commit -s -m "feat(frontend-grid): render hyphen marker between compound cells"
```

---

### Task 10: Frontend a11y — announce the hyphen (W4)

**Bounded context:** frontend · **PR:** same as Task 8

**Files:**
- Modify: `frontend/src/ui/components/grid/SeparatorOverlay.tsx` (add a visually-hidden announcement)
- Test: `frontend/e2e` a11y spec or `frontend/src/ui/components/grid/SeparatorOverlay.test.tsx`

**Interfaces:**
- Consumes: the same clue list.
- Produces: a screen-reader-perceivable indication that the answer is hyphenated (WCAG AA, ADR-0050) — the visual `-` is `aria-hidden`, so a non-visual cue is required.

- [ ] **Step 1: Write the failing a11y test.**

```tsx
test('exposes a visually-hidden trait d’union for each compound clue', () => {
  const clue = {
    direction: 'across' as const,
    clue: { text: 'x', arrow: 'right' as const, separators: [4] },
    cells: Array.from({ length: 8 }, (_, i) => ({
      kind: 'letter' as const, position: { row: 2, col: i + 1 }, entry: '',
    })),
    definition: { kind: 'definition' as const, position: { row: 2, col: 0 }, clues: [] as never },
  };
  const { getByText } = render(<SeparatorOverlay clues={[clue]} />);
  expect(getByText(/trait d’union/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm test -- SeparatorOverlay`
Expected: FAIL — no such node.

- [ ] **Step 3: Implement.** Add one visually-hidden `<span>` per compound clue (not per offset) describing the segmentation, e.g. text `Mot composé, trait d’union`. Use the design-system `srOnly`/visually-hidden utility (grep `srOnly` or `visuallyHidden` in `frontend/src/design-system`); place it near the clue's first cell.

- [ ] **Step 4: Run to verify it passes.**

Run: `pnpm test -- SeparatorOverlay`
Expected: PASS.

- [ ] **Step 5: Run the a11y baseline.**

Run: `pnpm a11y`
Expected: PASS (no new axe violations).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/components/grid/SeparatorOverlay.tsx \
        frontend/src/ui/components/grid/SeparatorOverlay.test.tsx
git commit -s -m "feat(frontend-grid): announce compound hyphen for screen readers"
```

---

## Self-Review Notes

- **Spec coverage:** W0→Task 1; W1→Task 2; W2 (domain+ingest)→Tasks 3–5; seed→Task 6; W3→Task 7; W4 (render+a11y)→Tasks 8–10. W5 intentionally deferred to a separate plan (noted in Scope).
- **Type consistency:** `separators` is `List<Int>` (Kotlin, Word/DTO), `number[]` (wire), `readonly number[]` (domain `DefinitionClue`). Offset semantics ("hyphen precedes cells[offset]") are identical across `HyphenSurface.split`, `Word.init`, and `SeparatorOverlay`.
- **Validation/placement untouched** across all tasks (global constraint honored).
- **Open detail for the implementer** (not a blocker): the exact visually-hidden utility name and the mapper-test fixture builder names are to be copied from existing sibling code (grep pointers given in-task), not invented.
