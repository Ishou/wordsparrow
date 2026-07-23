# ADR-0119: Adopt Démonette-2 as a French derivational-morphology resource

## Status
Proposed

## Context
WordSparrow needs to know **word families** — that `tirer`, `tir`, `tirons`,
`tireur` belong together; that `laver` derives `lavage`, `laveur`, `lavable`.
We do not have this today, and the gap shows up as concrete defects:

- **Derivational duplicates on a grid.** The distilled daily (ADR-0117/0118)
  placed `tir` and `tirons` on the same grid, and `laver` next to `lavage`.
  `WordAcceptor` (`:grid:domain`) blocks an exact surface repeat and a
  same-**lemma** repeat (`usedWords` + `usedLemmas`), but `tir` (lemma `tir`,
  a *nom déverbal*) and `tirons` (lemma `tirer`) have **different lemmas**, so
  the same-lemma guard never fires. These are *derivational* relatives, not
  inflectional ones — no lemmatiser links them, because lemmatisation
  normalises inflection, not derivation.
- **Clue leaks via morphological relatives.** A clue that shares a root with
  its answer (`général` cluing `générale`, `laver` in the clue for `lavage`)
  is a soft leak the current gold/leak checks catch only by substring luck.
- **A long-word clue desert ("finding B", ADR-0118).** Airy grids lean on long
  answers, and long answers in our corpus often carry a single clue, so the
  recurrence cooldown (ADR-0031 / #1659) starves them. The sanctioned clue
  lane is Modal Command-R (ADR-0087), which is remote and heavyweight; we have
  no local, licence-clean way to *manufacture* a fresh clue for a derived word.

Orthographic heuristics do not solve the duplicate case. A raw shared-prefix
rule (`tir`~`tirons`) was measured against the real corpus and carries heavy
false positives (`car`~`caractériser` ×194, `col`~`collaborer` ×215,
`par`~… ×568); a ±1-letter rule is no better (`abuser`~`amuser`,
`able`~`table`). Exact same-lemma-or-surface matching is false-positive-free
but structurally cannot see `tir`↔`tirer` — they share neither surface nor
lemma. The missing signal is a **derivation graph**, which is a linguistic
resource, not a string heuristic.

Inflectional resources we already have (Grammalecte/Hunspell lexicon, the
`(surface,pos)→lemma` corpus of ADR-0100) cover inflection only. DBnary
(ADR-0023, CC BY-SA, already ingested) carries a POS-agnostic `derivedFrom`
edge, but it is partial and noisy and was not built for morphology. The
purpose-built French derivational databases are:

| Resource        | Licence            | Verdict |
|-----------------|--------------------|---------|
| **Démonette-2** (Démonext) | **CC BY-SA 4.0** | usable — SA class, same as DBnary |
| Démonette v1.2  | CC BY-NC-SA 4.0    | forbidden (NC clause, ADR-0058) |
| MorphoLex-FR    | CC BY-NC-SA 4.0    | forbidden (NC clause, ADR-0058) |
| Lexique3        | CC BY-SA 4.0       | forbidden verdict retained (ADR-0058 note ⁴) |
| DériF           | tool only, no bulk data | not a dataset |

Démonette-2 is the one purpose-built, commercially-usable option. It is a
derivational database of French: ~287k lexemes and ~80k derivational relations
over ~117 affixes, covering suffixation (`-age`, `-eur/-euse`, `-ion`,
`-ment`, `-able`…), prefixation (`re-`, `dé-`, `en-`, `anti-`…), conversion
(V↔N *déverbal*, V↔A, N↔A) and parasynthetic derivation. Each relation is
annotated with POS of both ends, orientation (`des2as`/`as2des`), derivational
type, complexity (simple/complex, direct/indirect) and a semantic-motivation
flag. It is distributed as CSV tables (lexemes, relations, families) via
demonext.xyz and ORTOLANG under CC BY-SA 4.0 — verified at
`demonext.xyz/en/view-and-download-the-demonette-database/`. (An earlier
research note in this project mis-stated it as CC BY-NC-SA; that is the
retired **v1.2** licence, not the v2/Démonext release.)

Its licence is the **same SA class as DBnary**, which ADR-0058 already
accepts for local use, filtering, and training under the ShareAlike posture.
Adopting a new SA source is exactly the case ADR-0058's "Deferred" section
anticipates ("a separate ADR if a NEW SA-or-NC source ever enters scope … the
matrix is amended as sources are added"). This ADR is that separate ADR.

## Decision
Adopt **Démonette-2 (Démonext release, CC BY-SA 4.0)** as WordSparrow's
canonical French derivational-morphology resource, and make it the shared
foundation for the derivation-aware workstreams below. Each workstream lands
under its own ADR/PR; this ADR establishes the resource, the licence posture,
and the ingest.

**Licence posture (binding).** Démonette-2 sits in the same SA class as DBnary
and is governed by the ADR-0058 ShareAlike posture, not re-litigated here:

- Amend the ADR-0058 per-source verdict matrix with a Démonette-2 row (done in
  this PR): *training permitted (SA-acceptance), filter permitted, tool/local
  permitted, redistribute **forbidden***.
- The raw dump is a licensed corpus → it lives under `data/external/demonette/`
  (gitignored per ADR-0058 process rule 3) and is **never** shipped verbatim in
  a Docker image, chart, or public dataset.
- Attribution in `NOTICE.md` (Démonette-2 / Démonext, CC BY-SA 4.0, ORTOLANG),
  mirroring the DBnary and Grammalecte entries.
- The derived artifact we commit is a **filtered derivation graph** (our own
  normalised representation), which inherits SA — kept internal, consistent
  with the DBnary discipline.

**Ingest.** A one-shot ingest (`scripts/demonette/`) reads the Démonette-2 CSVs
and emits a normalised `surface/lemma → {related lexeme, relation type, affix,
orientation, complexity, semantic-motivation}` graph, filtered to what we use:

- Keep only **semantically-motivated, direct** relations whose derived form is
  **present in our corpus** — precision over recall; an opaque or accidental
  formal relation is excluded rather than risk a wrong family link.
- The output is a small, corpus-scoped resource loadable by `:grid` and the
  clue pipeline; the multi-hundred-k raw table stays out of the runtime.

**Roadmap (each its own ADR/PR — not built here).** The value ranking that
justifies adoption:

1. **Grid de-duplication.** A family-aware check in `WordAcceptor` excludes
   derivational relatives of already-placed answers (fixes the reported
   `tir`/`tirons`, `laver`/`lavage` bug). Highest priority — a live defect.
2. **Clue-leak detection.** A principled morphological-leak gate: reject a clue
   whose tokens are derivationally related to the answer, replacing the current
   substring-luck check.
3. **Derivational clue propagation.** A local, Modal-free clue lane that applies
   the answer's derivation to a known clue: `laver "nettoyer"` + `-age` →
   `lavage "nettoyage"`. Directly attacks finding B by manufacturing fresh
   clues for the long derived words that starve the cooldown. Output still
   passes the existing validation/leak/cell-cap gates.
4. **Family-aware cross-day variety / cooldown.** Cool down a whole family, not
   just a surface, so consecutive dailies do not circle one root.
5. **Difficulty signal.** Derivational complexity (simple vs parasynthetic,
   direct vs indirect) as one input to a per-word difficulty score.

## Consequences
**Easier:**
- One principled derivation graph serves de-duplication, leak detection, clue
  propagation, family cooldown and difficulty — instead of five string
  heuristics, each with its own false-positive profile.
- A **licence-clean, local** clue-generation lane becomes possible (propagation),
  reducing reliance on the remote Modal lane for the specific class of words
  that breaks distilled dailies.
- Supersedes the abandoned orthographic similarity-exclusion experiments
  (raw-prefix / ±1-letter), which measured too false-positive-heavy to ship.

**Harder / new:**
- A new external data dependency and a one-shot ingest to maintain; coverage is
  broad but not total, so de-duplication and leak checks are best-effort, not
  guarantees.
- The ShareAlike obligation extends to the derived graph and to any weights
  trained through a propagated clue — handled by the ADR-0058 posture
  (internal-only, no verbatim re-emission, strip-and-retrain path preserved).
- Propagated clues are generated text and must clear the same gates as every
  other clue (validation, leak, 25-char cell cap, second review).

**Different:**
- Démonette both **gates** clues (leak detection) and **generates** them
  (propagation) — the same resource on both sides of the clue pipeline.
- The binding licence verdict lives in the ADR-0058 matrix (single source of
  truth); this ADR is the policy and roadmap that points at it.

**Deferred (own ADRs):**
- The `WordAcceptor` family-aware dedup fix (roadmap item 1) — the immediate
  follow-up, since it fixes a live defect.
- The derivational clue-propagation lane (item 3) and its judge/leak gates.
- Family cooldown and the difficulty signal (items 4–5).
