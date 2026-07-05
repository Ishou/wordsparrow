# generation-gold-2000

A dedicated gold bucket of hand-authored (lemma, clue) pairs for the highest-impact
lemmas in real grid generation. Built to seed clue-AI training (RAFT/Command-R,
ADR-0087) with a solid, high-coverage base.

## What's here

- `clues.csv` — `lemma,clue,source`. **2 distinct definitions per lemma** for
  2000 lemmas (4000 rows). `source = bliss-authored` (CC0). Two defs cover
  different senses where the lemma is polysemous, otherwise two different angles.
- `tally.csv` — `lemma,placement_count,prior_status`. The provenance ranking:
  how often each lemma was placed across the sampled grids, and whether it already
  had a clue in `words-fr.csv` before this batch (`clued` / `UNCLUED`).

## How the lemma set was chosen

1. Generated **299 daily-config grids** (22×15, ADR-0095 low-density) with the
   production generator over the **full corpus including currently-unclued rows**
   (the runtime blank-clue gate normally hides them; it was lifted for the tally
   so unclued high-impact lemmas surface).
2. Tallied every placed `Word.lemma`; 4614 distinct lemmas appeared.
3. Took the **top 2000 by placement count** — no frequency floor, no length filter
   (short crossword-fill entries like compass points and sigles are kept
   deliberately; their existing clues are weak). 471 of the 2000 were previously
   unclued.

## Authoring gates (enforced before a pair entered `clues.csv`)

- **Non-self-reference**: a clue never contains its lemma, a ≥5-letter stem of it,
  or an inflected/derived form.
- **No pleonasm** (`validate_clue._find_pleonasm`).
- French, 1–8 words, definitional (no trailing period); foreign senses marked.
- The two definitions of a lemma are distinct.

## Intended use

Feed as a **distinct weighted source** into the Modal RAFT corpus builder
(`data/lora/modal_corpus_v1/`, see the `clue-ai` skill), kept separate from the
runtime `words-fr.csv` and from rated eval sets. Not a runtime corpus — these
are training seeds; promote to the shipped CSV only after review/rating.
