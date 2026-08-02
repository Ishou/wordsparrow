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
derivational database of French distributed as three CSV tables (lexemes,
relations, families). The figures below are **verified from the real dump**
(OSF `osf.io/db2w8`, downloaded and inspected 2026-07-23): **222,118 directed
relation rows** (each undirected pair stored both ways) and **253,131
families**, over **784 distinct constructions** covering suffixation (`Xage`,
`Xeur/Xeuse`, `Xion`, `Xment`, `Xable`…), prefixation (`reX`, `dé1X`, `inX`,
`antiX`…) and conversion (`X`, the V↔N *déverbal* case). Each relation carries
the columns we depend on:

- `graph_1`/`graph_2` — the two related lexemes (lemma-level; Démonette has
  **no conjugated forms**, so any consumer must lemmatise a surface first);
- `cat_1`/`cat_2` — POS **with gender** (`Nf`/`Nm`/`V`/`Adj`);
- `cstr_1`/`cstr_2` — the construction/affix of each side;
- `orientation` — `des2as` (derived→base) / `as2des` (base→derived);
- `complexite` — the effective motivation flag: `simple` (207k), `motiv-sem`
  (12.9k, semantically-motivated incl. **suppletive** pairs like
  `école`/`scolaire`), `motiv-form` (1.5k), `complexe` (390), and `accidentel`
  (78 false-friend pairs, e.g. `baptiser`/`baptême`);
- `fid` — a native family id (also indexed in `families.csv`).

Two capability facts the ingest and downstream specs must respect: the
`semty_*`/`sous_semty_*` semantic-role columns and the `def_conc`/`def_abs`
definition columns are **0 % populated** in this release — so semantic role
(action/agent/result) and ready-made definitions are **not** available;
consumers infer role from the affix (`cstr`) and reframe from our own clues.
Distribution is under CC BY-SA 4.0 — verified on the OSF project and at
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
- The derived artifact is a **filtered derivation graph** (our own normalised
  representation), which inherits SA — kept **internal and uncommitted**,
  hosted alongside the private corpus (ADR-0097 tier), never in a public repo
  or deployed artifact, consistent with the DBnary discipline.

**Ingest.** A one-shot ingest (`scripts/demonette/`) reads the Démonette-2 CSVs
and emits two normalised, self-describing artifacts — a directed relations
table (`lemma_from, cat_from, cstr_from, lemma_to, cat_to, cstr_to,
orientation, complexite`) and a families table (`lemma, family_id,
family_size`) — filtered to what we use:

- **Exclude `accidentel`** (false friends); keep `simple`/`motiv-sem`/
  `motiv-form` (and `complexe`, flagged). `motiv-sem` deliberately retains
  suppletive pairs (`école`/`scolaire`) that theming wants.
- Keep only relations whose **both endpoints are present in our corpus**
  (`words-fr.csv` `lemma` column, the same lowercase-accented space) — precision
  over recall; coverage on our vocabulary is reported by the ingest.
- The output is a small, corpus-scoped resource loadable by `:grid` and the
  clue pipeline; the multi-hundred-k raw table stays out of the runtime.

**Roadmap (each its own ADR/PR — not built here).** The value ranking that
justifies adoption:

1. **Grid de-duplication.** A family-aware `WordAcceptor` check excludes
   derivational relatives of already-placed answers (`tir`/`tirer`,
   `laver`/`lavage`). This is the derivational **layer 2** on top of the
   FP-free multi-lemma floor already shipped (the `lie`/`lia` inflectional-
   homograph fix, which uses ADR-0100's corpus data and needs no Démonette).
2. **Clue-leak detection.** A principled morphological-leak gate: reject a clue
   whose tokens are derivationally related to the answer, replacing the current
   substring-luck check.
3. **Derivational clue propagation.** A local, Modal-free clue lane that applies
   the answer's derivation to a known clue: `laver "nettoyer"` + `-age` →
   `lavage "nettoyage"`. Directly attacks finding B for long derived words that
   starve the cooldown. Because `semty` is unpopulated, reframing templates key
   off the **affix** (`Xage`/`Xion`→action, `Xeur`→agent), not a stored role;
   output passes the existing validation/leak/cell-cap gates.
4. **Family-aware cross-day variety / cooldown.** Cool down a whole family
   (native `fid`), not just a surface, so consecutive dailies do not circle one
   root — size-capped, since families run large (947 have 13+ members).
5. **Lexical-family theming.** Build themed grids from a family's members —
   e.g. an "école" grid spanning `école`/`scolaire`/`scolarité`/`préscolaire`.
   Feasible because Démonette links **suppletive** roots via `motiv-sem`; no
   curation needed for the motivating case.
6. **Difficulty signal.** Derivational complexity as one input to a per-word
   difficulty score.

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

**Shipped:**
- The family-aware dedup (roadmap item 1). `CsvWordRepository` loads the folded
  `simple`-derivation edges (`morphology/derivational_family_edges.csv`, built
  by `scripts/grid_family/build_derivational_family_edges.py` from the ingest
  output) and completes the `WordAcceptor` dedup key. **Direct** relations only
  (directed edges block edge-adjacent pairs — `saut`/`sauter`, `race`/`raciste` —
  without transitive spread across a full derivation family like `port`/`rapport`).
  Per the ADR-0058 Redistribute-forbidden verdict, the edges file is not a main
  resource and is not committed to this public repo: it loads through the same
  private corpus-dir resolver as `words-fr.csv` (ADR-0097), published to the
  private object storage bucket alongside the corpus. A missing file degrades
  to no derivational bridging rather than failing the load.

**Deferred (own ADRs):**
- Morphological clue-leak detection (item 2), replacing the current
  substring-luck check.
- The derivational clue-propagation lane (item 3) and its judge/leak gates.
- Family cooldown, lexical-family theming, and the difficulty signal (items 4–6).
