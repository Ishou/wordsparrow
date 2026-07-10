# Unified corpus source format — design + decision

- **Date:** 2026-07-10
- **Status:** Proposed (design approved; formal ADR-0099 to be minted during build)
- **Scope:** public `bliss` repo (clue-pipeline scripts, `CsvWordRepository`,
  guard tests) + private `wordsparrow-clue-data` repo (all source CSVs +
  runtime `words-fr.csv`).

## Context

The grid generator's per-grid dedup (`WordAcceptor`, `grid/domain/.../generation/WordAcceptor.kt`)
forbids two surfaces that share a `lemma`, so a puzzle never ships both `lie`
and `lia` (two inflections of `lier`). That constraint is correct and already
live. It failed on the live grid because the corpus **fed it wrong lemmas**:
`lia` shipped with `lemma=lia` instead of `lemma=lier`, so dedup could not fire.

Root cause: the runtime `words-fr.csv` is assembled by **six scripts that mutate
it in place, in sequence**, each pulling from a differently-shaped source and
each defaulting `lemma` to the surface form when it lacks a headword:

```
import_grammalecte_long_words  →  build_surface_clues / merge_clues_into_wordlist
  →  merge_editorial_into_wordlist  →  add_short_word_clues  →  add_greek_and_extras
  →  apply_clue_overrides
```

Several of these (`add_short_word_clues`, the editorial fallback, `build_pos_lemmas`)
write `lemma = word`. Short conjugations (`lia`, `nia`, `es`, `tué`, …) are exactly
the rows they touch, so those ship with `lemma = themselves` and dodge dedup.

A grammalecte-only fix (derive the lemma after the fact) is **not sufficient**:
the correct lemma of a surface depends on the *sense the clue uses*, and
grammalecte cannot see the clue. Proven cases:

- `es` = the verb *être* (clue "Existes") **and** the music note E-flat
  (clue "Mi bémol, en allemand", authored `pos=abr`). Grammalecte knows only
  the verb, so a blanket rewrite corrupts the note to `lemma=être`.
- `vue` = the noun (clue "Sens visuel"); grammalecte knows `vue` only as a form
  of `voir`/`vu`, so it cannot confirm the noun lemma at all.
- `lie` = the noun (dregs, `lemma=lie`) **and** the verb (`lemma=lier`).

The signal that resolves every one of these is the **authored part-of-speech**.
It already exists in some sources (`gold-2000/clues.csv` carries `pos`) but is
absent from others and never flows to the point where the lemma is set.

## Decision (ADR-class)

Adopt a **single unified row format across every clue source and the runtime
corpus**, carrying an authored `pos` and `lemma`, and replace the six in-place
mutators with a **normalize-then-merge** assembler. `pos` is the disambiguator
that makes the lemma deterministic per `(surface, pos)`; nothing downstream ever
defaults `lemma` to the surface again.

### Unified row schema

Every source **and** the runtime `words-fr.csv`:

```
word, language, length, frequency, difficulty, clue, source, source_license, pos, lemma
```

`pos` is new; `lemma` already exists in most sources. `pos` values reuse what the
sources already use: `nom, adj, adv, verbe` plus the invariable classes
`abr, sigle, interj, note, prep, …` (closed set, documented in the normalizer).

### Lemma rule (authoring contract), keyed on `(surface, pos)`

- `pos = verbe` → `lemma` is the verb **infinitive** (`lia/verbe → lier`).
- `pos ∈ {nom, adj, adv}` → `lemma` is the **citation form** (masc-sing / base).
- `pos ∈ {abr, sigle, interj, note, …}` (invariable) → `lemma = word` (self).

Hand-authored sources: the human writes `pos` + `lemma`. AI-generated clues are
already produced per `(lemma, pos)` and inflated to surfaces
(`build_surface_clues.py` emits `(surface, lemma, pos, clue)`) — same tuple.
Grammalecte-imported surfaces derive both from grammalecte.

### `reconcile_lemmas.py` — POS-aware derive + validate (already built, to extend)

Built this session (`scripts/clue_generation/reconcile_lemmas.py` + tests). It
already distinguishes genuine inflections from invariable sigles via grammalecte
tags (verb-paradigm / `pl` vs `inv`), so `lia→lier` but `am` (→ spurious `m`) is
left alone. Extend it to take `pos` as input:

- **Derive:** for a source that has `pos` but not `lemma`, return the lemma for
  `(surface, pos)` — verb infinitive for `verbe`, self for invariables, etc.
- **Validate (the guard):** a row passes iff its `lemma` is valid for
  `(surface, pos)`. With `pos` present this is fully deterministic — no
  exceptions allowlist. `es/abr,lemma=es` ✓; `es/verbe,lemma=être` ✓;
  `vue/nom,lemma=vue` ✓ (a `nom` whose lemma grammalecte can't confirm is
  accepted as self); `lia/verbe,lemma=lia` ✗ (must be `lier`).

### Refined root cause — the inflator collapses per-clue senses (added 2026-07-10)

The lemma bug is not only surface-defaulting emitters; it is baked into the
**inflator**. `build_surface_clues.py` iterates *surfaces* and, for each, sorts
its candidate `(lemma, pos)` by `POS_PRECEDENCE {nom:0, adj:1, adv:2, verbe:3}`
(`:253-255`) and keeps **one winner**. So surface `lie` with both a noun clue
(`lie/nom`) and a verb clue (`lier/verbe`) collapses to the noun — the verb sense
is discarded, and any verb-clued `lie` elsewhere keeps `lemma=lie`, defeating
dedup against `lia`(lier). This is *the* reported bug (`lie | "Unit solidement"`
shipping `lemma=lie`) and generalizes to a ~3200-row class of inflected surfaces
clued in a sense ≠ their assigned lemma (`abats | "Fais tomber"`, `ris |
"Manifestes sa gaieté"`). No after-the-fact grammalecte pass can fix it — the
clue's sense is the only disambiguator, and it lives at generation time.

**Fix: invert the inflator to forward inflation.** Iterate `(lemma, pos)` clues
and inflate each *forward* to its surfaces, emitting one row per sense carrying
that clue's own `(lemma, pos)`: `lier/verbe` → `(lie, lemma=lier, pos=verbe)`,
`lie/nom` → `(lie, lemma=lie, pos=nom)`. A surface legitimately gets multiple
rows (one per sense/clue); each carries the correct lemma, so grid dedup uses
the row's lemma correctly. This replaces the single-winner `POS_PRECEDENCE`
pick. The morphology mechanics (`inflect_clue`, the `inflection_status` codes,
the pleonasm/agreement guards) are preserved — only the loop direction and the
"one owner per surface" assumption change.

### Assembler refactor

Replace the six mutators with two stages that consume **every** tier — not only
hand-authored sources, but the two that are the *bulk* of the corpus: the
grammalecte-import tier (`import_grammalecte_long_words`, ~29k long-word
surfaces) and the forward-inflated LLM/clue tier (the rewritten
`build_surface_clues`). Each becomes a normalizer feeding the merge; retiring a
mutator without its replacement normalizer would drop its rows.

1. **Per-source normalizer** — one small function per source shape that emits
   unified rows (fills `pos`+`lemma`, deriving via `reconcile_lemmas` where the
   source has `pos` but no `lemma`).
2. **Single merge** — concatenate all normalized rows, dedup by `(word, clue)`
   keeping the highest-priority source, write `words-fr.csv`. Priority (highest
   first): `curated overrides > hand-authored (short/themed/gold) > editorial/
   inflated > LLM-generated > grammalecte placeholder`. Multiple *distinct* clues
   per word are preserved (the grid picks one); only identical `(word, clue)`
   pairs collapse.

### Runtime change

`CsvWordRepository` (`grid/infrastructure/.../persistence/CsvWordRepository.kt`)
accepts the new `pos` column — same shape as the optional `lemma` column it
already tolerates. The runtime does not yet *use* `pos`; it is carried for the
guard's determinism and for future POS-aware features. Loader stays
backward-compatible (header-shape detection, as today).

## Source inventory & migration

| Source | Current shape | Migration |
|---|---|---|
| `data/curated/short-fr.csv` | unified minus `pos` | add authored `pos`; lemma fixes already staged this session |
| `grid/.../words/themed/*.csv` | unified minus `pos`, blank lemma | author `pos`; lemma = self (invariables) |
| `data/curated/fr.csv` | unified minus `pos`, some blank lemma | author `pos` + lemma |
| `data/curated/generation-gold-*/clues.csv` | `word,clue,pos,source` | expand to unified; derive lemma from `(word,pos)` |
| `data/curated/raw/fr_len0{2,3}.csv` | `Mot;Déf1;Déf2` | convert to unified (author `pos`+`lemma`) |
| inflation `surface_clues.csv` | `surface,lemma,pos,clue,…` | map 1:1 to unified |
| grammalecte import | `(word,…,lemma)` | add `pos` from grammalecte |

## Already done this session (build on, don't redo)

- `scripts/clue_generation/reconcile_lemmas.py` — POS-aware-ready derive/validate
  core; `_is_inflection` filter (verb/`pl` vs `inv`) keeps abbreviations intact.
- `scripts/clue_generation/test_reconcile_lemmas.py` (13 unit tests, real lexique)
  and `scripts/eval/test_runtime_csv_lemmas.py` (runtime guard + wiring test).
- `data/curated/short-fr.csv` (private repo): 12 lemma corrections staged
  (`lia→lier`, `nia→nier`, `es→être`, `tué→tuer`, `né→naître`, …; `vue` kept).

## Consequences

**Easier:** lemma is authored once, at the source, with the sense in view; dedup
becomes reliable; the assembler is two comprehensible stages instead of six
order-dependent mutators; the guard is deterministic. Future POS-aware features
(clue selection, agreement) get `pos` for free.

**Harder / cost:** every source CSV must gain `pos` (bulk one-time authoring,
bootstrapped by `reconcile_lemmas`); `CsvWordRepository` + its tests change;
the corpus grows one column; the assembler rewrite is a real refactor touching
~6 scripts. `words-fr.csv` deploys on push to the private repo, so the cutover
is guarded by the runtime lemma test.

## Testing

- Unit: `reconcile_lemmas` derive/validate per `(surface, pos)` against the real
  lexique (extend existing 13 tests).
- Assembler: normalizer per-source golden rows; merge dedup/priority.
- Runtime guard: `test_runtime_csv_lemmas` becomes POS-aware; must be green on the
  regenerated `words-fr.csv` (zero `(surface,pos,lemma)` violations).
- `CsvWordRepository` loader test for the `pos` column (present / absent / blank).
- Existing `pytest scripts/eval` + Konsist/arch tests stay green.

## Rollout order

1. Mint ADR-0099 (unified corpus format) + update `docs/adr/INDEX.md`.
2. `reconcile_lemmas` gains `pos` input (derive + validate).
3. `CsvWordRepository` accepts `pos` (loader + test).
4. Per-source normalizers + the merge assembler; retire the six mutators.
5. Author/derive `pos`+`lemma` across all sources; regenerate `words-fr.csv`.
6. POS-aware runtime guard green; commit corpus (private) + code (public PRs).

## Out of scope

- Changing what the runtime *does* with `pos` (POS-aware clue selection, agreement).
- Any change to the LLM generation / RAFT training lane (ADR-0087) beyond emitting
  the unified tuple it already produces.
- The eye-similarity (cross-lemma look-alike) exclusion — a separate concern from
  same-lemma dedup.
