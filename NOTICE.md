# Notices and attributions

This file enumerates third-party data sources whose licenses require
attribution when redistributed as part of Bliss. See ADR-0013 §1 for the
rationale.

## Word corpus — fr (Grammalecte / Dicollecte)

- **Source:** `grammalecte.net` — `lexique-grammalecte-fr-v7.7.txt`
  (the Dicollecte French lexicon shipped with the Grammalecte grammar
  checker, v7.7). This is the **actual shipped word corpus**: ~118k
  rows carrying `source = grammalecte`, `source_license = MPL-2.0` in
  `grid/infrastructure/src/main/resources/words/words-fr.csv`, bundled
  into the grid Docker image.
- **License:** Mozilla Public License 2.0. The Dicollecte dictionary
  data was relicensed to a GPL/LGPL/MPL tri-license so it could ship in
  Firefox and LibreOffice; it is distributed as MPL-2.0. Confirmed in
  the `LICENSE` file of the Grammalecte dictionary distribution ("Ils
  sont disponibles sous licence Mozilla Public License 2.0") and in the
  identical data in `LibreOffice/dictionaries` `fr_FR`, whose
  `README_fr.txt` declares verbatim:

  > MPL : Mozilla Public License version 2.0 -- http://www.mozilla.org/MPL/2.0/

- **Canonical URL:** https://grammalecte.net

MPL-2.0 permits this redistribution provided attribution is preserved —
which this notice does. The version pinned at ingest time is `v7.7`; the
`source` / `source_license` columns of `words-fr.csv` record provenance
per row. See ADR-0014 for the ingest rationale and ADR-0058 for the
commercial-license posture. (The earlier `import-words` Hunspell-fr path
of ADR-0013 was superseded by `import-grammalecte`; no Hunspell-fr data
is shipped today.)

## Lexical enrichment — DBnary

- **Source:** `kaiko.getalp.org/dbnary` — French Wiktionary extract
  produced by the DBnary project (Sérasset et al., LIG/GETALP).
- **License:** Creative Commons Attribution-ShareAlike 4.0
  International (CC BY-SA 4.0) — inherited from Wiktionary.
- **Canonical URL:** https://kaiko.getalp.org/about-dbnary/

Per [ADR-0023](./docs/adr/0023-dbnary-lexical-data-source.md), DBnary
is used **only** as offline pipeline scratch space — feeding sense
disambiguation context to the local LoRA generator and providing
positive pairs for the filter model's contrastive training.

**No DBnary `definition_text` or `synonym_lemma` is distributed by
this repository.** The runtime corpus
(`grid/infrastructure/src/main/resources/words/words-fr.csv`) contains
only LLM-generated clues authored by us. Per-iteration eval CSVs that
historically embedded verbatim DBnary glosses are gitignored
(`data/eval/lemma_clues_iter[2-7].csv`,
`data/eval/sample_iter[2-7]_*.csv`, etc.) and stay local for
offline analysis only. We list DBnary here as a courtesy: the
filter model's training data and the LoRA's prompting pipeline are
derivative of DBnary as input, even though no source text is
shipped.

## Derivational morphology — Démonette-2 (Démonext)

- **Source:** `osf.io/db2w8` — the Démonext release of Démonette-2, a
  derivational database of French (lexemes, relations, families),
  also distributed via ORTOLANG.
- **License:** Creative Commons Attribution-ShareAlike 4.0
  International (CC BY-SA 4.0). This is the v2/Démonext release, not
  the retired Démonette v1.2 (CC BY-NC-SA 4.0).
- **Canonical URL:** https://osf.io/db2w8 and
  https://demonext.xyz/en/view-and-download-the-demonette-database/

Per [ADR-0119](./docs/adr/0119-adopt-demonette-derivational-morphology.md),
Démonette-2 is used to build a corpus-scoped derivation graph consumed
by `:grid` and the clue pipeline for derivational de-duplication and
leak detection. `scripts/demonette/ingest.py` filters the raw tables
to relations whose both endpoints are present in our corpus.

**No raw or verbatim Démonette-2 data is redistributed by this
repository.** The raw dump lives under the gitignored
`data/external/demonette/` and the derived, filtered derivation graph
is kept internal and uncommitted (ADR-0097 tier), never in a public
repo or deployed artifact — the same discipline as the DBnary entry
above.

## Modal clue-AI lane — language detection and base model

- lingua-language-detector v2.2.0 — Apache 2.0
  https://github.com/pemistahl/lingua-py
  Used by scripts/clue_generation/pipeline_v2/filters.py for FR/EN
  classification (§8.3 filter 6).

- Mistral-Nemo-Base-2407 — Apache 2.0 (model downloaded at training
  time; not bundled in any deployed artefact). Used by the Modal
  fine-tuning lane (ADR-0057).
