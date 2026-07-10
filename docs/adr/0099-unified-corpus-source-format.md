# ADR-0099: Unified corpus source format

## Status
Accepted

Extends ADR-0097 (private corpus object storage: the runtime `words-fr.csv`
this ADR reshapes) and ADR-0058 (licensed-data posture: each source CSV this
ADR touches keeps its existing per-source license classification unchanged).

## Context

The grid generator's per-grid dedup (`WordAcceptor`,
`grid/domain/.../generation/WordAcceptor.kt`) forbids two surfaces on the
same grid that share a `lemma`, so a puzzle never ships both `lie` and `lia`
(two inflections of `lier`). That constraint is correct and already live. It
failed on the live grid because the corpus **fed it wrong lemmas**: `lia`
shipped with `lemma=lia` instead of `lemma=lier`, so dedup could not fire.

Root cause: the runtime `words-fr.csv` is assembled by **six scripts that
mutate it in place, in sequence**, each pulling from a differently-shaped
source and each defaulting `lemma` to the surface form when it lacks a
headword:

```
import_grammalecte_long_words  →  build_surface_clues / merge_clues_into_wordlist
  →  merge_editorial_into_wordlist  →  add_short_word_clues  →  add_greek_and_extras
  →  apply_clue_overrides
```

Several of these (`add_short_word_clues`, the editorial fallback,
`build_pos_lemmas`) write `lemma = word`. Short conjugations (`lia`, `nia`,
`es`, `tué`, …) are exactly the rows they touch, so those ship with
`lemma = themselves` and dodge dedup.

A grammalecte-only fix (derive the lemma after the fact) is **not
sufficient**: the correct lemma of a surface depends on the *sense the clue
uses*, and grammalecte cannot see the clue. Proven cases:

- `es` = the verb *être* (clue "Existes") **and** the music note E-flat
  (clue "Mi bémol, en allemand", authored `pos=abr`). Grammalecte knows only
  the verb, so a blanket rewrite corrupts the note to `lemma=être`.
- `vue` = the noun (clue "Sens visuel"); grammalecte knows `vue` only as a
  form of `voir`/`vu`, so it cannot confirm the noun lemma at all.
- `lie` = the noun (dregs, `lemma=lie`) **and** the verb (`lemma=lier`).

The signal that resolves every one of these is the **authored
part-of-speech**. It already exists in some sources (`gold-2000/clues.csv`
carries `pos`) but is absent from others and never flows to the point where
the lemma is set.

## Decision

Adopt a **single unified row format across every clue source and the
runtime corpus**, carrying an authored `pos` and `lemma`, and replace the
six in-place mutators with a **normalize-then-merge** assembler. `pos` is
the disambiguator that makes the lemma deterministic per `(surface, pos)`;
nothing downstream ever defaults `lemma` to the surface again.

### Unified row schema

Every source **and** the runtime `words-fr.csv`:

```
word, language, length, frequency, difficulty, clue, source, source_license, pos, lemma
```

`pos` is new; `lemma` already exists in most sources. `pos` values reuse
what the sources already use: `nom, adj, adv, verbe` plus the invariable
classes `abr, sigle, interj, note, prep, …` (closed set, documented in the
normalizer).

### Lemma rule (authoring contract), keyed on `(surface, pos)`

- `pos = verbe` → `lemma` is the verb **infinitive** (`lia/verbe → lier`).
- `pos ∈ {nom, adj, adv}` → `lemma` is the **citation form** (masc-sing /
  base).
- `pos ∈ {abr, sigle, interj, note, …}` (invariable) → `lemma = word`
  (self).

Hand-authored sources: the human writes `pos` + `lemma`. AI-generated
clues are already produced per `(lemma, pos)` and inflated to surfaces
(`build_surface_clues.py` emits `(surface, lemma, pos, clue)`) — same
tuple. Grammalecte-imported surfaces derive both from grammalecte.

### `reconcile_lemmas.py` — POS-aware derive + validate

`scripts/clue_generation/reconcile_lemmas.py` already distinguishes genuine
inflections from invariable sigles via grammalecte tags (verb-paradigm vs
`pl`/`inv`), so `lia→lier` but `am` (→ spurious `m`) is left alone. It takes
`pos` as input:

- **Derive:** for a source that has `pos` but not `lemma`, return the
  lemma for `(surface, pos)` — verb infinitive for `verbe`, self for
  invariables, etc.
- **Validate (the guard):** a row passes iff its `lemma` is valid for
  `(surface, pos)`. With `pos` present this is fully deterministic — no
  exceptions allowlist. `es/abr,lemma=es` passes; `es/verbe,lemma=être`
  passes; `vue/nom,lemma=vue` passes (a `nom` whose lemma grammalecte
  can't confirm is accepted as self); `lia/verbe,lemma=lia` fails (must
  be `lier`).

### Assembler refactor

Replace the six mutators with two stages:

1. **Per-source normalizer** — one small function per source shape that
   emits unified rows (fills `pos` + `lemma`, deriving via
   `reconcile_lemmas` where the source has `pos` but no `lemma`).
2. **Single merge** — concatenate all normalized rows, dedup by
   `(word, clue)` keeping the highest-priority source, write
   `words-fr.csv`. Priority (highest first): `curated overrides >
   hand-authored (short/themed/gold) > editorial/inflated >
   LLM-generated > grammalecte placeholder`. Multiple *distinct* clues
   per word are preserved (the grid picks one); only identical
   `(word, clue)` pairs collapse.

### Runtime change

`CsvWordRepository`
(`grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt`)
accepts the new `pos` column — same shape as the optional `lemma` column it
already tolerates. The runtime does not yet *use* `pos`; it is carried for
the guard's determinism and for future POS-aware features. Loader stays
backward-compatible (header-shape detection, as today).

## Consequences

**Easier:** lemma is authored once, at the source, with the sense in
view; dedup becomes reliable; the assembler is two comprehensible stages
instead of six order-dependent mutators; the guard is deterministic.
Future POS-aware features (clue selection, agreement) get `pos` for free.

**Harder / cost:** every source CSV must gain `pos` (bulk one-time
authoring, bootstrapped by `reconcile_lemmas`); `CsvWordRepository` and
its tests change; the corpus grows one column; the assembler rewrite is a
real refactor touching ~6 scripts. `words-fr.csv` deploys on push to the
private repo, so the cutover is guarded by the runtime lemma test.
