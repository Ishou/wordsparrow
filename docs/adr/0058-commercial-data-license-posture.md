# ADR-0058: Commercial-data-license posture

## Status

Accepted (2026-05-26).

## Context

WordSparrow is moving from non-commercial sandbox to commercial intent
(maintainer decision, 2026-05-26). Prior ADRs made licensing decisions
under the assumption of indefinite non-commercial use:

- **ADR-0013** picked Hunspell-fr (MPL 2.0) over Lexique3 (CC BY-SA 4.0)
  for the word source, but framed the rejection as "we don't want to
  ship the corpus" rather than "we may go commercial".
- **ADR-0014** chose Grammalecte's `lexique-grammalecte-fr-v7.7.txt`
  (MPL-2.0) as the lemma/frequency signal, citing file-scoped copyleft.
  (The Grammalecte *grammar-checker application* is GPL-3.0; the
  *Dicollecte lexicon data file* it ships is the MPL-2.0-relicensed
  dictionary — see "License evidence" below. An earlier draft of this
  ADR conflated the two and labelled the data GPL 3.0.)
- **ADR-0023** accepted DBnary (CC BY-SA) for synonym/sense data, with
  a "distribution discipline" rule that DBnary text never lands in
  committed artifacts.

Commercial intent activates clauses that were previously inert. Three
distinct license behaviours now matter:

1. **NC (NonCommercial)** clauses (CC BY-NC-*): any derivative falls
   under NC and cannot support a commercial product. **Forbidden** for
   training, filtering paths, or any use whose output contributes to a
   commercial-shaped artifact. Local-only research reads are the only
   safe pattern, and that's a slippery slope.
2. **SA (ShareAlike)** clauses (CC BY-SA, GPL, etc.): derivatives must
   carry the same license. Commercial use is permitted, but
   contamination spreads — model weights trained on SA data are
   arguably SA-bound under a conservative reading. Acceptable with
   discipline.
3. **Permissive** licenses (MPL 2.0, Apache 2.0): commercial use is
   straightforward; attribution requirements apply.

Two recurring confusions need codification:

- **"Tool vs library vs data"** for copyleft sources: does loading a
  lexicon file as a morphology lookup table contaminate our code?
  (Answer: no, under "mere aggregation" reasoning; and for the
  Grammalecte/Dicollecte lexicon specifically the data is MPL-2.0
  file-scoped copyleft, so redistribution is permitted with the
  NOTICE.md attribution — see the matrix and "License evidence" below.)
- **"Training derivative vs filter-only vs tool"** for any source:
  what counts as a derivative? This ADR draws the line.

## Decision

### Per-source verdict matrix (binding)

| Source                          | License            | Training | Filter-only | Tool/local | Redistribute |
|---------------------------------|--------------------|----------|-------------|------------|--------------|
| Lexique3                        | CC BY-SA 4.0⁴      | **forbidden**⁴ | **forbidden**⁴ | local read only | **forbidden** |
| DBnary                          | CC BY-SA 4.0       | permitted¹ | permitted | permitted | **forbidden** |
| Grammalecte lexique data        | MPL-2.0            | permitted² | permitted | permitted | permitted (with notice)² |
| Hunspell-fr                     | MPL 2.0            | permitted | permitted | permitted | permitted (with notice) |
| Mistral-Nemo-Base-2407          | Apache 2.0         | permitted | n/a       | permitted | per Apache 2.0 |
| unsloth/c4ai-command-r-08-2024-bnb-4bit (Cohere Command-R) | Cohere C4AI Community License | permitted³ | n/a | permitted | **forbidden** |
| In-house (gold_pilot_v1, eval CSVs the maintainer authored) | maintainer-authored | permitted | permitted | permitted | permitted |

¹ DBnary training is permitted under the SA-contamination acceptance
in §"ShareAlike posture" below.

² Grammalecte's lexicon data file (Dicollecte dictionary) is MPL-2.0,
not GPL. It **is** redistributed in our shipped artifacts — the derived
corpus ships as `words-fr.csv` (source_license=MPL-2.0) inside the grid
Docker image — and that redistribution is permitted under MPL-2.0
provided attribution is preserved, which it is via `NOTICE.md`. Using it
locally to derive frequency / POS signals stored in our codebase is
likewise permitted. See ADR-0014 and "License evidence" below.

⁴ Lexique3/Lexique383 is CC BY-SA 4.0 (openlexicon:
`datasets-info/Lexique383/`, `LICENSE-CC-BY-SA4.0.txt`), **not** the
CC BY-NC-SA an earlier draft of this matrix stated — Lexique3 carries no
NonCommercial clause. The original NC-clause rationale for the forbidden
verdict therefore does not hold, and Lexique3 sits in the same SA class
as the **permitted** DBnary row. The forbidden verdict is **retained
pending maintainer confirmation** of a valid non-NC rationale (e.g.
avoiding additional SA contamination, or simply that Grammalecte —
already in scope — supersedes the need for it). This is a flag, not a
re-decision: the label is corrected, the verdict awaits review.

³ Cohere C4AI Community License permits commercial fine-tuning and local
use but prohibits redistribution of model weights. LoRA adapters derived
from Command-R are stored on the Modal volume and not released externally,
consistent with the §"ShareAlike posture" mitigations above. The unsloth
pre-quantized bnb-4bit redistribution is used under the same license terms.

### Definitions (binding)

- **Training path**: any code or pipeline that consumes a source and
  produces, directly or transitively, a model artifact (LoRA adapter,
  fine-tuned weights, DPO/RAFT round output) or a training-corpus
  JSONL/CSV that will feed such an artifact.
- **Filter-only path**: code that reads a source to make a binary
  keep/drop decision on an item, where the source's content does not
  appear in the kept item's text. Example: "drop this candidate if
  the lemma isn't recognised by Grammalecte" is filter-only;
  "annotate the candidate with the lemma's POS from Grammalecte"
  is *not* filter-only (POS becomes part of the data).
- **Tool path**: code that uses a source's executable / API for a
  one-shot transformation (e.g., POS tagging, morphology lookup)
  and discards the source after; the transformation result enters
  our codebase as data we own.
- **Redistribute**: include the source's content in any deployed
  artifact (docker image, helm chart, frontend bundle, model card,
  public dataset, generated CSV checked into the repo, model weights
  released externally).

### ShareAlike posture (DBnary specifically)

We accept that a LoRA adapter trained on a corpus that contains
DBnary text (gloss / synonym fields) may, under a conservative
reading, be SA-bound. Our mitigations:

- **No verbatim re-emission.** Generated clues are net-new text;
  pipeline_v2's filters drop obvious paraphrase/copy outputs.
- **No external weight publication.** LoRA adapters live on the
  Modal volume; they are not released, sold, or shared externally.
  If a future workstream needs to publish weights (partner
  integration, open-source release), we strip DBnary-tainted
  training rounds and re-train from scratch on permissively-licensed
  data only.
- **No DBnary text in deployed artifacts.** Per ADR-0023, eval CSVs
  carrying verbatim DBnary glosses are gitignored. The `data/eval/
  production/` outputs are LoRA-only and don't carry DBnary text.

If at any point we want to drop SA contamination entirely (clean
weights for a commercial release), the path is: replace DBnary with
a permissively-licensed French wordnet (BabelNet commercial license,
WOLF subset, or in-house curation) and re-train. Tracked as deferred.

### Process rules (binding)

1. **Every new data source added under `scripts/`, `data/`, or
   `modal_jobs/` requires:**
   - An entry in this ADR's matrix (or a new ADR amending it) in the
     same PR.
   - License classification in the PR body — which path category
     (training / filter / tool) it enters.
   - A `.gitignore` rule if the source is a downloaded data file
     larger than ~1 MB or covered by any non-permissive license.
2. **"Licence review needed" is no longer a valid spec state.** Every
   data dependency needs a verdict at spec time, not deferred to
   implementation. Spec amendments referencing unclassified sources
   are rejected at review.
3. **`data/external/` is the canonical drop point for licensed corpora
   used locally** (gitignored as of 2026-05-26 via PR #659). The
   gitignore is preventive; the ADR is the policy.

### License evidence (auditable)

Where each classification above is sourced upstream, so the matrix is
verifiable rather than asserted:

- **Grammalecte / Dicollecte lexicon → MPL-2.0.** The Dicollecte French
  dictionary data was relicensed from GPL to a GPL/LGPL/MPL tri-license
  so it could ship inside Firefox and LibreOffice; the lexicon data is
  distributed as MPL-2.0. Upstream statement: "Ils sont disponibles sous
  licence Mozilla Public License 2.0"
  (`github.com/FrancoisCapon/GrammalecteDictionariesWithoutOptionalDataFields`,
  `LICENSE`). Same data ships in `LibreOffice/dictionaries` `fr_FR`
  whose `README_fr.txt` declares "MPL : Mozilla Public License version
  2.0". Note the Grammalecte *grammar-checker application* is GPL-3.0
  (e.g. its Firefox add-on listing) — that is the software, not the
  lexicon data file this project ingests. See ADR-0014 and `NOTICE.md`.
- **Lexique3 / Lexique383 → CC BY-SA 4.0.** openlexicon distributes it
  under CC BY-SA 4.0 (no NonCommercial clause):
  `github.com/chrplr/openlexicon`, `datasets-info/Lexique383/` and the
  bundled `LICENSE-CC-BY-SA4.0.txt`.
- **DBnary → CC BY-SA 4.0**, inherited from Wiktionary
  (`kaiko.getalp.org/about-dbnary/`). See ADR-0023.

## Consequences

**Easier:**

- License posture is one matrix to consult, not a hunt through three
  ADRs.
- Reviewers can flag PRs without classification quickly: "PR adds
  `data/foo.csv`; matrix entry?".
- The `Lexique3` verdict is forbidden (see note ⁴): the label was
  corrected to CC BY-SA 4.0 and its rationale is pending maintainer
  confirmation, but the verdict itself is not re-opened for re-litigation
  by implementers.

**Harder:**

- Adding new commercially-restricted data sources is now explicitly
  off the table. Was implicit before.
- Some research uses of Lexique3 (e.g., as a frequency reference for
  filter design) are set aside; the replacement is Grammalecte's lexicon
  (already in scope). Note the original "commercial intent forbids it"
  reasoning assumed an NC clause that Lexique3 does not carry — see
  note ⁴; the forbidden verdict is retained but its rationale is under
  maintainer review.

**Different:**

- DBnary use continues with explicit SA-acceptance + mitigations
  documented above. ADR-0023's distribution discipline is preserved
  and now load-bearing for commercial defensibility.
- The Modal-migration spec's "Lexique3 licence review needed" note is
  amended in this PR to reference the matrix verdict (forbidden).

**Deferred:**

- Replacement for DBnary if/when we want to ship clean weights.
- A CI guard that flags PRs adding files under `data/external/` or
  `data/dbnary/` without an accompanying ADR matrix update. Process
  rule above is the first line; CI gate if drift occurs.
- A separate ADR if a NEW SA-or-NC source ever enters scope (e.g.,
  ConceptNet, WikiSource). This ADR doesn't enumerate every possible
  future source; it sets the policy and the matrix is amended as
  sources arrive.
