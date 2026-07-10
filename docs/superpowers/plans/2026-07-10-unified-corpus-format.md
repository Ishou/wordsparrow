# Unified Corpus Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every clue source and the runtime `words-fr.csv` one unified row shape carrying authored `pos` + `lemma`, so the grid generator's same-lemma dedup gets correct lemmas and the `lia`/`lie`-style live-grid dup can never recur.

**Architecture:** `pos` is the disambiguator — lemma is derived/validated per `(surface, pos)` against grammalecte, deterministically. Six in-place corpus mutators collapse into per-source *normalizers* (emit unified rows) + one *merge* (concat, dedup by `(word, clue)` with source priority). `reconcile_lemmas.py` becomes the POS-aware derive-and-validate core; a POS-aware runtime test guards the result.

**Tech Stack:** Python 3 (pipeline, `scripts/clue_generation` + `scripts/eval`, grammalecte `MorphologyIndex`), Kotlin/Ktor (`grid/infrastructure` `CsvWordRepository`), pytest, Konsist.

## Global Constraints

- Grammalecte lexique lives at `~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt` (env `GRAMMALECTE_LEX` overrides); tests skip gracefully when absent.
- Runtime corpus path: `grid/infrastructure/src/main/resources/words/words-fr.csv` (private `wordsparrow-clue-data` repo; public repo has only the mock at `grid/api/src/test/resources/mock-corpus/words/words-fr.csv`).
- Unified schema (exact column order): `word, language, length, frequency, difficulty, clue, source, source_license, pos, lemma`.
- POS closed set (normalizer-enforced): `nom, adj, adv, verbe` (variable) + `abr, sigle, interj, note, prep, num, propername` (invariable → lemma = self). Extend only with a code + test change.
- Lemma rule per `(surface, pos)`: `verbe`→verb infinitive; `nom|adj|adv`→citation form (self when grammalecte can't confirm); invariable classes→self.
- No `--no-verify`, no force-push. Conventional commits with `-s` (DCO). Scope `clue-gen` for scripts, `grid-infra` for the loader, `docs` for ADR.
- Do NOT invoke the MLX lane or touch the RAFT/Modal training lane (ADR-0087).

---

## File Structure

**Public `bliss` repo:**
- `docs/adr/0099-unified-corpus-source-format.md` — new ADR (Task 1).
- `docs/adr/INDEX.md` — register ADR-0099 + path globs (Task 1).
- `scripts/clue_generation/reconcile_lemmas.py` — add `derive_lemma` + pos-aware `reconcile` (Task 2). Already exists (POS-less version + `_is_inflection`).
- `scripts/clue_generation/test_reconcile_lemmas.py` — extend (Task 2).
- `scripts/eval/test_runtime_csv_lemmas.py` — make guard POS-aware (Task 4).
- `grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt` — accept `pos` column (Task 3).
- `grid/infrastructure/src/test/kotlin/.../CsvWordRepositoryTest.kt` — pos-column tests (Task 3).
- `grid/api/src/test/resources/mock-corpus/words/words-fr.csv` — add `pos` column to the fixture (Task 3).
- `scripts/clue_generation/corpus_normalizers.py` — per-source → unified rows (Task 5).
- `scripts/clue_generation/test_corpus_normalizers.py` — new (Task 5).
- `scripts/clue_generation/assemble_corpus.py` — the merge (Task 6).
- `scripts/clue_generation/test_assemble_corpus.py` — new (Task 6).
- Retire (Task 7): `add_short_word_clues.py`, `add_greek_and_extras.py`, `merge_editorial_into_wordlist.py`, `merge_clues_into_wordlist.py`, `apply_clue_overrides.py`, `import_grammalecte_long_words.py` — logic folds into normalizers.

**Private `wordsparrow-clue-data` repo (Task 8, data):**
- All source CSVs gain `pos` (+ lemma where blank/surface).
- `grid/infrastructure/src/main/resources/words/words-fr.csv` regenerated with `pos`.

---

## Task 1: ADR-0099 + INDEX registration

**Files:**
- Create: `docs/adr/0099-unified-corpus-source-format.md`
- Modify: `docs/adr/INDEX.md`

**Interfaces:**
- Produces: the canonical decision text every later task cites.

- [ ] **Step 1: Write the ADR** using the template in `CLAUDE.md` (Status: Accepted). Body = the "Decision (ADR-class)" section of `docs/superpowers/specs/2026-07-10-unified-corpus-format-design.md`: unified row schema, `(surface,pos)` lemma rule, normalize-then-merge assembler, POS carried into runtime, POS-aware reconcile/guard. Consequences from the spec.

- [ ] **Step 2: Register in INDEX.md** — add the `0099` row and a path-glob mapping for `scripts/clue_generation/**`, `scripts/eval/**`, `grid/infrastructure/**/CsvWordRepository.kt`, and `**/words/words-fr.csv` → ADR-0099.

- [ ] **Step 3: Verify registry coherence**

Run: `python3 scripts/adr-context.sh scripts/clue_generation/assemble_corpus.py`
Expected: ADR-0099 body prints.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0099-unified-corpus-source-format.md docs/adr/INDEX.md
git commit -s -m "docs(adr): ADR-0099 unified corpus source format"
```

---

## Task 2: POS-aware `reconcile_lemmas.py`

**Files:**
- Modify: `scripts/clue_generation/reconcile_lemmas.py`
- Test: `scripts/clue_generation/test_reconcile_lemmas.py`

**Interfaces:**
- Consumes: `MorphologyIndex` (`scripts/eval/morphology_index.py`), existing `_norm`, `_is_inflection`, `_classify`.
- Produces:
  - `INVARIABLE_POS: frozenset[str]` = `{"abr","sigle","interj","note","prep","num","propername"}`.
  - `derive_lemma(surface: str, pos: str, index) -> tuple[str, str | None]` → `(status, lemma)` where status ∈ `{"ok","ambiguous","no-verb-reading"}`; `lemma` is `None` only for `ambiguous`.
  - `reconcile(surface, lemma, index, overrides=None, pos=None)` — unchanged signature plus optional `pos`; when `pos` is given, validation is POS-scoped.

- [ ] **Step 1: Write failing tests** (append to `test_reconcile_lemmas.py`)

```python
def test_derive_lemma_verb_unique(index):
    assert reconcile_lemmas.derive_lemma("lia", "verbe", index) == ("ok", "lier")

def test_derive_lemma_verb_ambiguous(index):
    assert reconcile_lemmas.derive_lemma("tue", "verbe", index) == ("ambiguous", None)

def test_derive_lemma_invariable_is_self(index):
    assert reconcile_lemmas.derive_lemma("es", "abr", index) == ("ok", "es")
    assert reconcile_lemmas.derive_lemma("mcm", "note", index) == ("ok", "mcm")

def test_derive_lemma_noun_unconfirmed_is_self(index):
    # grammalecte lacks the noun `vue`; pos=nom must fall back to self, not `vu`.
    assert reconcile_lemmas.derive_lemma("vue", "nom", index) == ("ok", "vue")

def test_derive_lemma_noun_confirmed(index):
    assert reconcile_lemmas.derive_lemma("lie", "nom", index) == ("ok", "lie")

def test_reconcile_pos_scoped_note_vs_verb(index):
    # es/abr keeps es; es/verbe must be être.
    assert reconcile("es", "es", index, pos="abr") == ("ok", "es")
    assert reconcile("es", "es", index, pos="verbe") == ("fixed", "être")
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest scripts/clue_generation/test_reconcile_lemmas.py -q`
Expected: FAIL (`derive_lemma` undefined; `reconcile` has no `pos` kwarg).

- [ ] **Step 3: Implement** in `reconcile_lemmas.py`

```python
INVARIABLE_POS = frozenset({"abr", "sigle", "interj", "note", "prep", "num", "propername"})
_VARIABLE_NOMINAL = frozenset({"nom", "adj", "adv"})


def derive_lemma(surface: str, pos: str, index) -> tuple[str, str | None]:
    """Lemma for an authored (surface, pos). Invariables and unconfirmable
    nouns resolve to the surface itself; a verb resolves to its infinitive,
    or ("ambiguous", None) when the surface is a form of several verbs."""
    pos = (pos or "").strip().lower()
    if pos in INVARIABLE_POS:
        return ("ok", surface)
    forms = index.lookup_form(surface)
    if pos == "verbe":
        heads = {l for l, t in forms if _classify(t) == "verbe"}
        if len(heads) == 1:
            return ("ok", next(iter(heads)))
        if len(heads) > 1:
            return ("ambiguous", None)
        return ("no-verb-reading", surface)
    if pos in _VARIABLE_NOMINAL:
        for l, t in forms:
            if _classify(t) in ("nom", "adj") and _norm(l) == _norm(surface):
                return ("ok", l)          # surface is its own citation form
        heads = {l for l, t in forms if _classify(t) in ("nom", "adj")}
        return ("ok", next(iter(heads))) if len(heads) == 1 else ("ok", surface)
    return ("ok", surface)


# in reconcile(...), add `pos: str | None = None` param; at the top, when pos:
#     status, want = derive_lemma(surface, pos, index)
#     if want is None:                      # ambiguous verb
#         ov = (overrides or {}).get(surface.lower())
#         if ov is not None:
#             return ("override", ov)
#         return ("ambiguous", lemma)
#     return ("ok", lemma) if _norm(lemma) == _norm(want) else ("fixed", want)
# (the existing pos-less body remains the fallback when pos is None)
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest scripts/clue_generation/test_reconcile_lemmas.py -q`
Expected: PASS (all, incl. the prior 13).

- [ ] **Step 5: Commit**

```bash
git add scripts/clue_generation/reconcile_lemmas.py scripts/clue_generation/test_reconcile_lemmas.py
git commit -s -m "feat(clue-gen): POS-aware lemma derivation + validation in reconcile_lemmas"
```

---

## Task 3: `CsvWordRepository` accepts the `pos` column

**Files:**
- Modify: `grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt`
- Test: `grid/infrastructure/src/test/kotlin/.../CsvWordRepositoryTest.kt`
- Modify fixture: `grid/api/src/test/resources/mock-corpus/words/words-fr.csv` (append a `pos` column)

**Interfaces:**
- Consumes: the unified header. Loader must accept the header with `pos` present after `source_license` and before `lemma`, AND remain backward-compatible with headers lacking `pos` (same tolerant pattern as the existing optional `lemma`).
- Produces: `Word` unchanged for now (pos parsed but not surfaced on the domain type — YAGNI; see spec "Out of scope"). Read and discard the `pos` cell so a present column does not shift `lemma` parsing.

- [ ] **Step 1: Write failing test** — a header with `...,source_license,pos,lemma` loads and `lemma` is read from the correct (last) column; a legacy header without `pos` still loads. Mirror the existing `lemma`-column test cases in `CsvWordRepositoryTest.kt`; add a `pos`-present fixture string and assert `lemma` resolves (e.g. `lia`→`lier`).

- [ ] **Step 2: Run to verify fail**

Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepository*'`
Expected: FAIL (header validator rejects the `pos` column / `lemma` read from wrong index).

- [ ] **Step 3: Implement** — extend `validateHeader` to accept a `+pos+lemma` (and `+pos`) header shape alongside the existing legacy / `+lemma` / `+lemma+theme` shapes; in `toWordWithFreq`, key columns by name (via the `DictReader`-equivalent index map) rather than fixed position so a present `pos` cell is read by name and ignored. Keep `lemma` defaulting to folded surface when absent (unchanged).

- [ ] **Step 4: Run to verify pass**

Run: `./gradlew :grid:infrastructure:test --tests '*CsvWordRepository*'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add grid/infrastructure/.../CsvWordRepository.kt grid/infrastructure/.../CsvWordRepositoryTest.kt grid/api/src/test/resources/mock-corpus/words/words-fr.csv
git commit -s -m "feat(grid-infra): CsvWordRepository accepts the unified pos column"
```

---

## Task 4: POS-aware runtime guard

**Files:**
- Modify: `scripts/eval/test_runtime_csv_lemmas.py`

**Interfaces:**
- Consumes: `reconcile` with `pos`. Guard reads `pos` from each row and validates `(surface, pos, lemma)`; fails only on status `"fixed"` (a provable, non-ambiguous wrong lemma). `"ambiguous"` remains informational (a `verbe` form of several verbs needing an authored override).

- [ ] **Step 1: Update the fixture test** in `_violations` to pass `pos=r.get("pos")` into `reconcile`, and update `test_guard_fires_...` fixtures to include `pos`:

```python
rows = [
    {"word": "lia", "pos": "verbe", "lemma": "lia", "clue": "Attacha jadis"},   # violation
    {"word": "es",  "pos": "abr",   "lemma": "es",  "clue": "Mi bémol"},         # OK (note)
    {"word": "es",  "pos": "verbe", "lemma": "être","clue": "Existes"},          # OK
    {"word": "lia", "pos": "verbe", "lemma": "lier","clue": "Attacha jadis"},    # already correct
]
assert [h[0] for h in _violations(rows, index)] == ["lia"]
```

- [ ] **Step 2: Run to verify fail** (fixture asserts new pos behavior)

Run: `python3 -m pytest scripts/eval/test_runtime_csv_lemmas.py -q`
Expected: FAIL until `_violations` threads `pos`.

- [ ] **Step 3: Implement** — in `_violations`, call `reconcile(surface, lemma, index, pos=(r.get("pos") or "").strip() or None)`; keep the `status == "fixed"` failure rule.

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest scripts/eval/test_runtime_csv_lemmas.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/test_runtime_csv_lemmas.py
git commit -s -m "feat(clue-gen): POS-aware runtime lemma guard"
```

---

## Task 5: Per-source normalizers

**Files:**
- Create: `scripts/clue_generation/corpus_normalizers.py`
- Test: `scripts/clue_generation/test_corpus_normalizers.py`

**Interfaces:**
- Consumes: `derive_lemma` (Task 2), `MorphologyIndex`.
- Produces: `UNIFIED_FIELDS: list[str]` (the 10 columns); `normalize_unified(rows: list[dict], index) -> list[dict]` (fills `pos`/`lemma` where derivable, passes authored values through); `normalize_raw_defs(path, index) -> list[dict]` (the `Mot;Déf1;Déf2` shape → unified); `normalize_gold(path, index) -> list[dict]` (`word,clue,pos,source` → unified with derived lemma). Each returns rows keyed by `UNIFIED_FIELDS`.

- [ ] **Step 1: Write failing tests** — one per normalizer with a 2-3 row golden fixture. Assert: a `themed` row with blank `pos`/`lemma` for `dr` (abbrev) yields `pos` from a passed default and `lemma=dr`; a `gold` row `es,"Mi bémol",abr,…` yields `lemma=es`; a raw `LIA;Attacha;…` row yields a unified row with `word=lia`. Cover the ambiguous case: a `verbe`-tagged `tue` with no authored lemma raises a clear "needs authored lemma" error (do not silently emit surface).

- [ ] **Step 2: Run to verify fail.** Run: `python3 -m pytest scripts/clue_generation/test_corpus_normalizers.py -q` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** the normalizers. Each maps its source shape to `UNIFIED_FIELDS`; where `lemma` is blank/absent but `pos` is known, call `derive_lemma`; on `("ambiguous", None)` raise `ValueError(f"{word}/{pos} needs an authored lemma")` so authoring gaps surface loudly (per spec: never default to surface).

- [ ] **Step 4: Run to verify pass.** Run: `python3 -m pytest scripts/clue_generation/test_corpus_normalizers.py -q` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/clue_generation/corpus_normalizers.py scripts/clue_generation/test_corpus_normalizers.py
git commit -s -m "feat(clue-gen): per-source corpus normalizers to the unified schema"
```

---

## Task 6: The merge assembler

**Files:**
- Create: `scripts/clue_generation/assemble_corpus.py`
- Test: `scripts/clue_generation/test_assemble_corpus.py`

**Interfaces:**
- Consumes: `corpus_normalizers` (Task 5).
- Produces: `SOURCE_PRIORITY: list[str]` (highest first: `overrides, curated, themed, gold, editorial, inflated, llm, grammalecte`); `merge(normalized_sources: list[list[dict]]) -> list[dict]` — concat, dedup by `(word.lower(), clue)` keeping the highest-priority source, sorted `(language, word, clue)` for stable diffs; `main()` CLI writing `words-fr.csv`.

- [ ] **Step 1: Write failing tests** — dedup keeps the higher-priority source for an identical `(word, clue)`; two *distinct* clues for one word both survive; output is sorted deterministically (idempotent on re-run).

- [ ] **Step 2: Run to verify fail.** Run: `python3 -m pytest scripts/clue_generation/test_assemble_corpus.py -q` — Expected: FAIL.

- [ ] **Step 3: Implement** `merge` + `main`. `main` normalizes each configured source, merges, writes with `csv.DictWriter(fieldnames=UNIFIED_FIELDS, lineterminator="\n")`.

- [ ] **Step 4: Run to verify pass.** Run: `python3 -m pytest scripts/clue_generation/test_assemble_corpus.py -q` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/clue_generation/assemble_corpus.py scripts/clue_generation/test_assemble_corpus.py
git commit -s -m "feat(clue-gen): normalize-then-merge corpus assembler"
```

---

## Task 7: Retire the six in-place mutators

**Files:**
- Delete: `add_short_word_clues.py`, `add_greek_and_extras.py`, `merge_editorial_into_wordlist.py`, `merge_clues_into_wordlist.py`, `apply_clue_overrides.py`, `import_grammalecte_long_words.py` (and their tests), after confirming each one's logic is represented by a normalizer in Task 5.

**Interfaces:**
- Consumes: nothing new. This is removal + reference cleanup.

- [ ] **Step 1: Grep for references** — `grep -rIn "add_short_word_clues\|add_greek_and_extras\|merge_editorial_into_wordlist\|merge_clues_into_wordlist\|apply_clue_overrides\|import_grammalecte_long_words" scripts docs`. Any runbook/skill mention must be repointed to `assemble_corpus.py`.

- [ ] **Step 2: Delete the scripts + their tests.** For each deleted module, confirm a Task-5 normalizer covers its source (checklist in the PR body).

- [ ] **Step 3: Run the pipeline test suite.** Run: `python3 -m pytest scripts/clue_generation scripts/eval -q` — Expected: PASS (collection errors only for the pre-existing `sklearn`-less judge tests).

- [ ] **Step 4: Commit.**

```bash
git add -A scripts/clue_generation
git commit -s -m "refactor(clue-gen): retire six in-place mutators for the merge assembler"
```

---

## Task 8: Author `pos` + `lemma` across sources; regenerate corpus (private repo)

**Files (private `wordsparrow-clue-data`):**
- All `data/curated/*` + `grid/.../words/themed/*.csv` gain `pos` (+ lemma where blank/surface).
- Regenerate `grid/infrastructure/src/main/resources/words/words-fr.csv`.

**Interfaces:**
- Consumes: `assemble_corpus.py` (Task 6), `reconcile_lemmas.derive_lemma` (Task 2).

- [ ] **Step 1: Bootstrap `pos` where derivable.** For sources that already carry `pos` (gold), it flows through. For themed/curated without `pos`, seed each file's `pos` by class (themed `chem/roman/sigle/unit/abbrev`→ invariable classes; verb-form rows in `short-fr.csv`→`verbe`) using a one-off `reconcile_lemmas`-backed script; **print every `("ambiguous", None)` and `("no-verb-reading", …)` row for human authoring** — do not guess.

- [ ] **Step 2: Human authors the residue** (the printed ambiguous/no-reading list, e.g. `tue/verbe→tuer`). Commit the authored source CSVs.

- [ ] **Step 3: Regenerate.** Run `python3 scripts/clue_generation/assemble_corpus.py --out <private>/grid/.../words-fr.csv`. Confirm the diff touches only `pos`/`lemma` cells and genuinely new/removed rows (not a full re-quote).

- [ ] **Step 4: Guard green.**

Run: `GRAMMALECTE_LEX=~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt python3 -m pytest scripts/eval/test_runtime_csv_lemmas.py -q` (point `WORDLIST` at the private corpus)
Expected: PASS (zero `fixed` violations). Spot-check `lia→lier`, `es`(note)`→es`, `es`(verb)`→être`.

- [ ] **Step 5: Commit + push** the private corpus, then open the public `bliss` PR(s) for Tasks 1-7.

```bash
# private repo
git -C ~/IdeaProjects/wordsparrow-clue-data add -A
git -C ~/IdeaProjects/wordsparrow-clue-data commit -s -m "corpus: unified pos+lemma across sources; regenerate words-fr.csv"
```

---

## Self-Review

- **Spec coverage:** unified schema (Task 3 runtime + Task 5 sources), `(surface,pos)` lemma rule (Task 2), assembler refactor (Tasks 5-7), reconcile derive+validate (Task 2), runtime `pos` + guard (Tasks 3-4), source migration (Task 8), ADR (Task 1). All spec sections mapped.
- **Placeholder scan:** core logic (`derive_lemma`, guard threading) shown as real code; data-authoring residue (Task 8) is inherently human but bounded by a printed ambiguous list, not left vague.
- **Type consistency:** `derive_lemma` returns `(status, lemma|None)` used identically in Tasks 2/4/5; `reconcile(..., pos=None)` signature consistent across Tasks 2/4; `UNIFIED_FIELDS` shared by Tasks 5/6.
- **Scope:** one coherent workstream; Tasks 1-7 are public-repo PRs (each ≤400 lines), Task 8 is the private-repo data cutover gated by the Task-4 guard.
