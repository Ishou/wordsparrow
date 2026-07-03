---
name: clue-ai
description: Implement, train, evaluate, or fix the French clue-generation AI pipeline. THE SOLE GENERATION + TRAINING LANE IS MODAL CLOUD-GPU COMMAND-R (ADR-0057 as amended by ADR-0087) — QLoRA/RAFT training on A100 (`modal_jobs/`), generation via `modal_jobs/04_generate_command_r.py`, gating via `scripts/clue_generation/pipeline_v2/` filters + an LLM judge. The legacy local MLX lane (mlx-lm training/inference, `run_production.sh`, CamemBERT filter as shipping gate) was RETIRED 2026-06-23 — never invoke it or propose it. Still live and lane-independent: grammalecte morphology + lemma→surface inflation, the Python `validate_clue` runtime guards, DBnary handling, and the Kotlin `bliss-worker` (`clue_candidates` Postgres table + CSV export). Use when the task touches `modal_jobs/`, `scripts/clue_generation/`, `scripts/eval/`, `scripts/dbnary/`, `data/{eval,lora,lora_filter,lora_dpo,dbnary,curated}/`, `models/`, `grid/worker/src/main/kotlin/com/bliss/grid/worker/{clues,dbnary}/`, the Python validator/morphology helpers, the eval logbook at `docs/eval/clue-gen-v0.md`, or when changing what gets emitted into `grid/api/src/main/resources/words/words-fr.csv`. Encodes ADR-0013 (offline batch worker), ADR-0023 (DBnary CC BY-SA constraints), ADR-0024 (synonym-lemma narrow relaxation), ADR-0087 (MLX retirement), the eval methodology from `docs/eval/clue-gen-v0.md`, and the licence + leak failure modes that have actually bitten this repo.
paths: ["modal_jobs/**", "scripts/clue_generation/**", "scripts/eval/**", "scripts/dbnary/**", "grid/worker/src/main/kotlin/com/bliss/grid/worker/clues/**", "grid/worker/src/main/kotlin/com/bliss/grid/worker/dbnary/**", "grid/application/src/main/kotlin/com/bliss/grid/application/lexicon/**", "grid/domain/src/main/kotlin/com/bliss/grid/domain/lexicon/**", "data/eval/**", "data/lora/**", "data/lora_filter/**", "data/lora_dpo/**", "data/dbnary/**", "data/curated/**", "models/**", "docs/eval/**"]
---

# Clue-AI playbook

> **⚠️ Lane status (ADR-0087, 2026-06-23).** The **Modal Command-R lane
> is the sole generation + training lane.** The local MLX lane (mlx-lm,
> `run_production.sh`, `train_lora.sh`, `train_dpo.sh`,
> `lora_iter*.yaml`, CamemBERT filter as shipping gate) is **RETIRED**
> — never invoke it, never propose it, never treat its scripts'
> defaults as production. Its scripts hard-stop unless `FORCE_MLX=1`.
> Sections below marked **[RETIRED — MLX]** are kept only because
> still-live rules (stem-leak threshold, pleonasm set, eval
> methodology) were derived there.

For everything in the offline French clue-generation pipeline: corpus building, Modal QLoRA/RAFT training, generation + gating, validator gates, lemma→surface inflation, DBnary handling, and the bridge that lands clues in the committed `words-fr.csv`. Inference for the product is never deployed: the production read path is the in-tree CSV (ADR-0013 §8). Everything below is binding because licence missteps and leak regressions have already cost real iterations.

## Anchor documents

- `docs/adr/0087-retire-mlx-clue-generation-lane.md` — **read first.** Modal Command-R is the sole lane; what's retired vs still live.
- `docs/adr/0057-cloud-gpu-modal-finetune-lane.md` — the Modal lane's shape (volumes, secrets, cost bounds, corpus tiers). Its "second lane / training-only" framing is amended by ADR-0087.
- `docs/runbooks/clue-loop.md` — the operational RAFT loop: campaign lifecycle, `extract_winners.py`, corpus build, Modal train, round tagging.
- `docs/clue-style-guide-v2.md` — the style rubric the `pipeline_v2` filters and the LLM judge enforce.
- `docs/adr/0013-words-clues-worker.md` — the offline-batch shape, the §5 clue rules (length cap, retry-on-overrun, drop on repeated overrun), the worker subcommand surface, and the §8 amendment that made the committed CSV the production source of truth (no DB read path in prod). The hosted-LLM lane described in §5 has been retired.
- `docs/adr/0023-dbnary-lexical-data-source.md` — the CC BY-SA constraints. Read constraint #1 and #2 word-for-word before touching anything that surfaces DBnary content (definition_text, synonyms, gloss).
- `docs/adr/0024-dbnary-synonym-lemma-as-direct-clue-candidate.md` — the **narrow** relaxation that authorises a capitalized `synonym_lemma` as `clue_text` with `source = 'dbnary-synonym'`. Definitions are still off-limits. Don't extend the relaxation by analogy.
- `docs/eval/clue-gen-v0.md` — the live eval logbook. MLX iter1 → iter18 (frozen history), then Modal `round-N` entries (round-11 Opus-as-judge, round-12 POS-conditioned regen, …). **This logbook is the source of truth for which Modal adapter (`raft-round-N`) is currently production and how each round was gated.** Read the latest round entry before generating. Append a new round section for any change you ship; do not silently overwrite a row.
- `NOTICE.md` — attribution surface. The Hunspell-fr / DBnary entries here are load-bearing for licence compliance; don't drop one without an ADR.

## Pipeline at a glance (Modal Command-R — the only lane)

```
lemma CSV (curated demand list, e.g. data/curated/clue_gap_top3000_lemmas.csv)
        │
        ▼
modal_jobs/04_generate_command_r.py   (Modal A100, adapter raft-round-N —
        │                              latest promoted round in the eval logbook)
        │  candidates.jsonl on volume mots-fleches-generations
        ▼
scripts/clue_generation/pipeline_v2/  (structural + style-guide-v2 gates,
        │                              incl. stem-leak + pleonasm ported from validate_clue)
        ▼
LLM judge (sense-first mots-fléchés rubric — THE quality gate since round-11;
        │  the CamemBERT filter is retired as a gate, cosine ≠ sense-correctness)
        ▼
scripts/clue_generation/build_surface_clues.py   (lemma→surface inflation:
        │             MorphologyIndex.inflect on the head token,
        │             POS precedence nom>adj>adv>verbe)
        ▼
scripts/clue_generation/merge_clues_into_wordlist.py   (ADDITIVE merge —
        │             fill blank placeholders only, never overwrite shipped clues)
        ▼
grid/api/src/main/resources/words/words-fr.csv (committed; prod read path)
        ▲
        └── runtime guards: scripts/eval/test_runtime_csv_pleonasms.py + pytest scripts/eval/
```

The training loop (RAFT) runs alongside: `/sondage` ratings → close campaign → `extract_winners.py` → `build_modal_corpus` → `03a_upload_dataset.py` → `03b_finetune_command_r.py` → tag `raft-round-N`. Full procedure in `docs/runbooks/clue-loop.md`.

The dbnary-synonym lane (`bliss-worker derive-synonym-clues`) and the worker ingestion path (`ingest-clue-candidates` → `export-words`) still exist; when both LLM and synonym candidates target one lemma in `clue_candidates`, `findTopBySourcePriority` picks per lemma via distinct `source` values. Don't collapse the sources — the priority order is how we keep dbnary-synonym as a free-win without it pre-empting better LLM clues. Note that rounds 11–12 shipped via the direct additive CSV merge above, not through the worker.

## Lane reality (post-ADR-0087): Modal Command-R only

The lane lives at `modal_jobs/` + `scripts/clue_generation/modal/` +
`scripts/clue_generation/pipeline_v2/`, on Modal A100s (ADR-0057).
There is **no lane choice to make** — Modal Command-R is it:

| Lane  | Status | Base model | Hardware | Trainer / generator | source_batch prefix in `survey_items` |
|-------|--------|------------|----------|---------------------|----------------------------------------|
| **Modal — Command-R** | **SOLE ACTIVE LANE** | command-r-08-2024-4bit (35B) | Modal A100-40GB | `modal_jobs/03b_finetune_command_r.py` (train, lives on `experiment/command-r-base`) + `modal_jobs/04_generate_command_r.py` (generate, on main) | `c4ai-command-r-pilot-v1-r<N>-<hash>` |
| Modal — Mistral | dormant (round-1 only; A/B reserve) | Mistral-Nemo-Base-2407 (12B) | Modal A100-40GB | `modal_jobs/03b_finetune.py` | `mistral-nemo-pilot-v1-r<N>-<hash>` |
| MLX | **RETIRED 2026-06-23 (ADR-0087)** | Command-R-08-2024-4bit (32B) | Apple Silicon | ~~`mlx_lm.lora` via `train_lora.sh`~~ — hard-stopped | `command-r-lora-vN-iterMM` (historical) |

**Counters — do not conflate:** MLX `iterN` is frozen history in
`docs/eval/clue-gen-v0.md`; the live counters are Modal `corpus_vN`
(recipe version of `data/lora/modal_corpus_v1/manifest.toml`) and
Modal RAFT `round-N` (training cycle within a corpus version). The
Command-R fork was cut from the Mistral palier in commit `6894271a`
(1.36 vs 1.71 eval loss on the same gold corpus) and has been the
active path since round-9 (2026-05-29); round-10 was the first
correctif-aware retrain, and `raft-round-10` generated rounds 11–12.

### Modal-lane runbook (cost-aware)

| # | Command                                                                          | Cost ≈ | Validates |
|---|----------------------------------------------------------------------------------|--------|-----------|
| 0 | `modal run modal_jobs/00_hello_world.py`                                         | $0.01  | Modal auth |
| 1 | `modal run modal_jobs/01_gpu_check.py`                                           | $0.02  | A100 available |
| 2 | `modal run modal_jobs/02_download_mistral.py`                                    | $0.05  | HF token + licence + volume |
| C | `python3 -m scripts.clue_generation.modal.build_modal_corpus`                    | $0     | Fused-corpus JSONL |
| 3a | `modal run modal_jobs/03a_upload_dataset.py`                                    | $0.01  | Dataset volume |
| 3b | `modal run modal_jobs/03b_finetune_command_r.py` (Command-R; `03b_finetune.py` = dormant Mistral fork) | $1.50 | Adapter on volume |
| 4 | `modal run modal_jobs/04_generate_command_r.py --run-tag raft-round-<N> …`       | ~$1–3  | candidates.jsonl on `mots-fleches-generations` (pipeline_v2-gated) |
| 5 | LLM-judge pass over candidates (sense-first rubric; see round-11/12 logbook entries) | varies | GOOD/BAD/BORDERLINE labels |
| 6 | `build_surface_clues.py` → `merge_clues_into_wordlist.py` (**additive**)         | $0     | Updated committed `words-fr.csv` + runtime guards |
| 8* | `bliss-worker ingest-clue-candidates --source c4ai-command-r-pilot-vN`          | $0     | Postgres `clue_candidates` (worker path — rounds 11–12 used the direct merge in 6 instead) |
| 9* | `bliss-worker export-words`                                                     | $0     | Committed `words-fr.csv` via worker path |

### Modal-lane corpus

- Manifest: `data/lora/modal_corpus_v1/manifest.toml` (committed).
- Tier weights (default): gold=4, silver=2, bronze=1. See spec
  `docs/superpowers/specs/2026-05-25-clue-ai-modal-migration-design.md`
  §2.2 + §3.7.
- Held-out enforcement: `data/eval/eval_human.jsonl` lemmas are
  excluded by assertion in `build_modal_corpus.py`. Same held-out
  set as MLX lane → eval numbers comparable.
- Bumping any manifest value bumps the corpus version
  (`modal_corpus_v1` → `modal_corpus_v2`). Every Modal adapter
  records the manifest hash in its `model_version` so adapter →
  corpus → manifest is traceable.
- The builder is **CSV-only**. The original `winners_round_N.jsonl`
  slot design was never wired into `build_modal_corpus.py`; the
  working path is a per-round CSV with a `weight_column` for per-row
  replication (PR #712 plumbing).

### How survey ratings + correctifs flow into a Modal round

`scripts/clue_generation/extract_winners.py` reads the survey DB and
writes `data/lora/modal_corpus_v1/winners_round_<N>.csv` with one row
per winner. It pulls **both**:

- **RAFT winners:** maintainer `qualite = 5, flag NULL` ratings on
  items whose `source_batch` matches `%-r<N>-%` (the round-N
  generations), **rated within the just-closed campaign**
  (`r.campaign_id = <latest campaign>`).
- **Correctifs:** auto-GOOD ratings (`f21da63a`) on
  `source = 'rater_proposed'` items the maintainer wrote in
  `/sondage`. The auto-GOOD path stamps the proposed item with
  `qualite = 5, flag NULL` attributed to the rater. Post-2026-05-30
  maintainer correctifs additionally get
  `survey_items.training_weight = 3.0` (gold); the corpus builder
  replicates those rows 3× via `weight_column = "training_weight"`.

The maintainer is auto-resolved from `maintainer_roles`. No
`--user-id` arg.

**Campaign gate (ADR-0059).** `extract_winners.py` resolves the
most-recently-opened campaign and **refuses to run while it is still
open**. Close the round's campaign before extracting
(`UPDATE campaigns SET closed_at = now() WHERE closed_at IS NULL;`).
RAFT winners are scoped to that just-closed campaign's `campaign_id`;
correctifs are cumulative gold and deliberately *not* campaign-scoped.
One campaign per round — open one before each rating session, close it
before the RAFT step. Full lifecycle in `docs/runbooks/clue-loop.md`.

**Dead-leg history (pre-PR-#713):** the auto-GOOD wiring was in place
from 2026-05-28 but `extract_winners.py`'s source_batch filter
silently excluded all `rater_proposed` items. Rounds r1–r9 trained
without seeing any survey correctifs even though the DB held them.
Round-10 (2026-06-01) is the first cycle with correctifs in the
training corpus. When diagnosing "why didn't my correctif move the
needle?", check whether the round predates this fix.

### Don'ts (Modal lane)

- **Don't** start a RAFT retrain without closing the round's campaign
  first. `extract_winners.py` refuses on an open latest campaign, but
  the orchestration habit is close → extract → train → import next
  round → open. One open campaign spanning multiple rounds is the
  2026-05-30 incident (ADR-0059).
- **Don't** point `03b_finetune.py` at gold-only data without
  invoking `--mode gold-only` on `03a_upload_dataset.py` — the
  default fused corpus is what the spec calls for.
- **Don't** bump the Mistral base model without a new ADR and
  retraining: adapters are base-model-specific.
- **Don't** lower the pleonasm or stem-leak threshold in
  `pipeline_v2/filters.py` to "fix" a regression — the gates are
  closed-set by construction, drift requires a logbook entry.
- **Don't** push training data containing lemmas from
  `data/eval/eval_human.jsonl` into the Modal volume — the held-out
  set is the only way to compare lanes fairly.
- **Don't** add arbitrary-code-evaluation (`eval(...)`) to the
  manifest row-filter — the micro-parser at
  `build_modal_corpus.py::_apply_row_filter` is intentional, extend
  it explicitly if the grammar needs to grow.

## Stack at a glance

| Concern | Choice | Notes |
|---|---|---|
| Base LLM (QLoRA target) | `c4ai-command-r-08-2024-bnb-4bit` (unsloth pre-quantized) on Modal A100, volume `mots-fleches-models` | 35B. Pinned; bumping is an ADR-class change. Training + generation both on Modal (ADR-0057/0087). **Product inference is never deployed — prod reads the committed CSV.** |
| Fine-tuning | Modal QLoRA + RAFT | `modal_jobs/03b_finetune_command_r.py`; rounds tagged `raft-round-N` on volume `mots-fleches-adapters`. ~~mlx-lm `lora` configs (`lora_iter*.yaml`)~~ **[RETIRED — MLX]**. |
| Quality gate | `pipeline_v2` filters + LLM judge | Structural/style gates in `scripts/clue_generation/pipeline_v2/filters.py`, then a sense-first LLM judge (round-11: Opus). ~~CamemBERT bi-encoder filter (`models/filter-camembert-v*`)~~ **[RETIRED as gate — round-11: AUROC 0.73, cosine ≠ sense-correctness]**. |
| Morphology | grammalecte lexique 7.7 | `lexique-grammalecte-fr-v7.7.txt` (MPL-2.0). Drives `validate_clue` head/POS lookup + surface inflation. **Live.** |
| Lexical data (synonyms, defs) | DBnary (Wiktionary RDF) | CC BY-SA. **definition_text** never leaves the offline pipeline. **synonym_lemma** allowed as direct clue per ADR-0024. **Live.** |
| Validator | `scripts/eval/validate_clue.py` | Pure Python, no model. **Live as runtime guard** (`test_runtime_csv_pleonasms.py`, `pytest scripts/eval/`). Fold-time trusts `pipeline_v2` flags instead — the MLX-era validator false-flags valid Command-R clue shapes (round-12 logbook entry). |
| Eval rating | y / b / n in CSV `rating` column; GOOD/BAD/SKIP in `/sondage` | y=1.0, b=0.5, n=0.0. Self-rating runs ≈10pp stricter than user-rating; don't compare across calibrations. |
| Worker side | Kotlin / Ktor stack — see the `jvm-backend` skill for layer rules | Worker subcommands: `ingest-clue-candidates`, `derive-synonym-clues`, `ingest-dbnary`, `export-words`. |

## Data layout (binding)

```
data/
├── curated/fr.csv               # CC0 hand-authored (lemma, clue) seed pairs.
├── dbnary/dbnary_fr.csv         # parsed DBnary export. Local-only; never deployed.
├── eval/                        # iter samples, generated clues, hand ratings (rating column).
│   ├── sample_100*.csv
│   ├── lemma_clues_iter*.csv    # source-of-truth eval rows; append, never rewrite.
│   └── production/              # full-scale runs (lemma_clues_raw / shipped / dropped).
├── lora/                        # SFT corpus: train.jsonl / valid.jsonl / test.jsonl.
├── lora_filter/                 # filter contrastive corpus.
└── lora_dpo/                    # mined preference pairs (chosen, rejected) from rated iters.
models/
├── lora-clue-v1..vN/            # [RETIRED — MLX] SFT + DPO adapters, iter-era history. Live adapters are on the Modal volume `mots-fleches-adapters` (raft-round-N).
├── filter-camembert-v1..vN/     # [RETIRED as gate] ranker checkpoints; round-11 showed cosine ≠ sense-correctness. Kept for archaeology.
└── filter-crossencoder-v1/      # alt cross-encoder explored; never the production path.
```

Anything under `data/` and `models/` is gitignored at scale (large weights, regeneratable corpora). The exception is the rated CSVs under `data/eval/`, which encode human judgement and **must be checked in** when they back a docs/eval iter row.

## ADR-0023 / ADR-0024 — DBnary licence rules

Three constraints are load-bearing. Internalise these before writing any code that reads from `data/dbnary/`:

1. **`definition_text` never leaves the offline pipeline.** Not in a CSV that ships, not in a clue field, not in `clue_candidates.clue_text`, not in a LoRA training pair, not in a prompt sent to a hosted LLM. The filter v1–v5 models train against `(lemma, definition)` positive pairs, but they emit **scores only** — the weights are non-redistributive scratch space (note in `build_filter_corpus.py` head comment).
2. **`synonym_lemma` is allowed as direct `clue_text` only when capitalized per ADR-0024.** First letter uppercased, with `source = 'dbnary-synonym'` on the `clue_candidates` row. Lower-case verbatim DBnary strings are not allowed; the capitalization is the editorial step that distinguishes Bliss output from a DBnary copy.
3. **DBnary data stays in the local-dev / offline tier.** No DBnary content in any deployed artefact, no `dbnary_fr.csv` baked into a worker image, no public URL pointing into `data/dbnary/`. The committed `words-fr.csv` only carries LLM-generated clues + dbnary-synonym capitalized lemmas — both pass the constraints.

If you find yourself wanting to surface DBnary glosses to end users, that's an ADR. Don't sneak it through.

## [RETIRED — MLX] LoRA training — corpus + config

> **Do not run anything in this section** (ADR-0087). Training happens
> on Modal via `docs/runbooks/clue-loop.md`. Kept because the
> hyperparameter lessons (best-val-loss promotion, SFT vs DPO learning
> rates) inform the Modal trainer too.

The SFT corpus is built by `scripts/clue_generation/build_corpus.py`. Inputs:

- `data/curated/fr.csv` — CC0 seed (currently ~62 pairs).
- Hand-rated `y` rows from `data/eval/lemma_clues_iter*.csv` (different valid clues per lemma kept as separate examples — variation, not noise).
- Optional Claude-authored synthetic pairs per `data/lora/synthetic_clues.py` (CC0; iter10 added 400 of these and lifted +7.5pp on the 20-lemma test set).

Configs live at `scripts/clue_generation/lora_iter*.yaml`. The pattern from iter10 onward:
- `train_type: lora`, `train_mode: sft` (or `dpo` for iter12+).
- `num_layers: 16`, `batch_size: 2` for SFT; `batch_size: 4` if rank ≥ 32.
- SFT learning rate ≈ `1e-5`. **DPO learning rate ≈ `1e-6`** (sigmoid loss, β = 0.1) — orders of magnitude lower than SFT. Mixing the two will silently overfit.
- `iters` short enough to stop before val loss climbs. iter10's best was iter 100 (val loss 0.815); iter8's best was iter 200. Always promote the **best-val-loss adapter**, not the last one — train loss keeps falling on a small corpus.
- `resume_adapter_file:` for DPO points at the SFT base adapter (today: `models/lora-clue-v3/adapters.safetensors` — the iter10 SFT). DPO refines preference; it does not replace SFT. Every promoted DPO iter (iter12, iter13.2, iter14, iter17, …) re-DPO'd from `v3` rather than chaining DPO-on-DPO — iter13.1 is the documented counter-example of why chaining drifts.

Train via `scripts/clue_generation/train_lora.sh` or directly:

```
mlx_lm.lora --config scripts/clue_generation/lora_iter12_dpo.yaml
```

When you ship a new adapter:
1. Copy the previous iter's yaml, bump the `iter` number in the path, and document the diff in a header comment.
2. Add the iter row to `docs/eval/clue-gen-v0.md` with acceptance %, train/val loss curve, and the qualitative diff (≥5pp moves at N=80 only).
3. Re-train the filter only when the failure-mode mix changed materially — filter v5 is from iter11's hand-paired (y, n).

## [RETIRED as gate] Filter (CamemBERT) — what it did + thresholds

> **Not a shipping gate anymore.** Round-11 measured the bi-encoder at
> AUROC 0.73 vs an LLM-judged held-out set, and no bi/cross-encoder
> retrain matched LLM judgment at the available label budget — **the
> LLM judge is the gate** (labels at `data/eval/round11_opus_labels.csv`
> if you want to train a real judge). Don't resurrect the filter as a
> shipping decision without a fresh eval that beats that finding.

The filter (`models/filter-camembert-vN`) is a sentence-transformers bi-encoder over CamemBERT base, contrastively trained on:
- DBnary `(lemma, sense)` positive pairs (in-batch random negatives).
- Round-2 hand-authored same-lemma `(y, n)` triplets (subtle wrong-sense / polysemic-wrong negatives — exactly the failure modes the validator can't catch).
- Iter `(y, b/n)` pairs from the rated eval CSVs (excluding the held-out `eval_human.jsonl` rows used for measurement).

At inference (`run_production.sh` phase 3), the filter encodes lemma and `lemma_clue` separately and uses cosine similarity as `filter_score`. The default ship threshold is `T = 0.65` (env var `THRESHOLD`). Below T, clue is dropped. Above T **and** validator flag = `ok`, clue is shipped. The hardcoded `FILTER=` default in `run_production.sh` lags production — override on the command line with the version named in the latest eval-logbook iter row.

Don't push T below 0.6 without a fresh held-out eval — the filter starts admitting wrong-sense negatives that look syntactically clean. Don't push T above 0.75 without a fresh eval either — recall on legitimate metaphor / pun clues collapses (`amende → "Contravention financière"` style).

## `validate_clue` flags — the structural gate

`scripts/eval/validate_clue.py` is the gate that runs **before** the filter score. The output `flag` column drives downstream behaviour:

| flag | meaning |
|---|---|
| `ok` | clue passes structural checks. Filter still has to clear `T`. |
| `no-head` | clue has no content-word token (only function words / empty). |
| `unknown-head` | clue's first content word isn't in grammalecte. Hallucination signal. |
| `head-not-lemma` | clue's head is an inflected form, not the citation form. Mots-fléchés convention requires lemma. |
| `pos-mismatch` | clue head is a lemma but the POS class differs from the target lemma's POS. |
| `pleonasm` | the clue's verb already encodes the trailing modifier (`Associer ensemble`, `Monter en haut`, `Prévoir à l'avance`). |
| `stem-leak` (iter7+) | clue token shares ≥5-char prefix with the lemma OR is a substring of the lemma when both are ≥5 chars. |
| `self-leak` | clue contains the lemma or any of its inflected forms. |

The threshold for `stem-leak` is **5 chars** by deliberate choice — 4 catches `couvrir → "Protéger avec une couverture"` but starts firing on Latin/Romance affixes (`pre-`, `con-`, `de-`, `re-`). Don't bump it without re-running the iter7 5-sample variance check (mean 86.0%, stdev 2.5pp).

## Eval methodology — what's measurable, what isn't

From the iter4 regression analysis: **at N=80 with one candidate per lemma, single-iteration variance is ~7pp**. Implications:

- Any structural change (validator rule, prompt tweak) needs to clear ~5pp on N=80 to be distinguishable from noise. Smaller deltas are unmeasurable.
- Once you go to 200+ lemmas with N=3 candidates per lemma + best-of-3 selection, variance drops below 3pp and iter-to-iter comparisons become meaningful. This is the methodological floor for promoting a structural change.
- **Self-rated baseline runs ≈10pp stricter than user-rated.** Never compare a self-rated number to a user-rated number — they're different scales. Mark each iter row in the logbook with `(user)` or `(self)` and only compare like-to-like.
- The 5-sample variance check (run `scripts/eval/run_top_x.sh` with seeds 20260601-05) is the canonical way to confirm a number isn't sample-specific. iter7 sat at 86.0% ± 2.5pp across 5 seeds; that's what "robust" means here.

The `decision rule` table in `docs/eval/clue-gen-v0.md`:
- ≥85% → SHIP (skip further fine-tuning).
- 70–85% → fine-tune (LoRA, then DPO).
- <70% → investigate (prompt, base model, curated set).

That table is the gate for shipping a new adapter into the production pipeline; do not promote an adapter that hasn't cleared the 5-sample variance check at the appropriate decision-rule threshold.

## [RETIRED — MLX] `run_production.sh`

**Do not run it** (it now hard-stops without `FORCE_MLX=1`; ADR-0087).
This was the MLX-lane end-to-end script: sample top-X lemmas → batched
mlx-lm generation → CamemBERT threshold split into
`lemma_clues_shipped.csv` / `lemma_clues_dropped.csv`. Its output files
under `data/eval/production/` are the provenance of the pre-round-11
clue base — that's the only reason to ever read it. The live
production path is the Modal diagram at the top of this skill.

## Lemma → surface inflation (the lemma-to-grid bridge)

The LoRA generates clues at **lemma form** — citation form, i.e. infinitive verb / masc-sing noun / masc-sing adjective. The grid, however, contains **surface forms** at arbitrary morphology: `unis` (2sg ipre of `unir` *or* mas-pl ppas), `astres` (mas-pl noun), `abominables` (epi-pl adj), etc. The crossword convention requires the clue's grammar to agree with its surface. Two-stage build closes that gap:

1. **`scripts/eval/inflect_clue.py`** — head-only inflection. Given a surface's grammalecte tags + a lemma-form clue, find the clue's first content-word token whose POS matches the surface, derive the inflectional target (mood + person + gender + number, with the paradigm prefix stripped), and inflect the head via `MorphologyIndex.inflect`. Other tokens stay verbatim. Multi-token agreement (adjective tracking the noun's gender across the clue) is intentionally out of scope — the head-only rule covers the dominant crossword patterns.
2. **`scripts/clue_generation/build_surface_clues.py`** — the per-surface table builder. For every surface in `words-fr.csv` (length 4–11), it determines the owning `(lemma, pos)` using grammalecte's `Total occurrences` with POS precedence `nom > adj > adv > verbe` on ties, then either copies the lemma's clue verbatim (when `surface == lemma`) or inflects the head. Output column `inflection_status` records what happened:

| `inflection_status` | meaning |
|---|---|
| `verbatim` | surface == lemma; clue copied as-is. |
| `inflected` | head token successfully inflected to surface morphology. |
| `identity` | inflected form equals the original (already correct). |
| `no-inflection` | `MorphologyIndex.inflect` couldn't produce the target form (defective paradigm or syncretism mismatch — see PR #193). |
| `head-pos-mismatch` | no token in the clue matches the surface's POS (e.g. clue is all-noun but surface is verb). |
| `no-target-pos` | surface POS not in {nom, adj, verbe}. |
| `no-owner` | no `(lemma, pos)` candidate has a clue in `lemma_clues_shipped.csv`. |

3. **`scripts/clue_generation/merge_clues_into_wordlist.py`** — final assembly. Reads `surface_clues.csv`, keeps `validation_flag == ok` rows above the filter threshold, replaces the placeholder `clue == word` field in the runtime `grid/api/src/main/resources/words/words-fr.csv`. Rows without a high-confidence surface clue keep the placeholder (the grid generator still works; the renderer treats `clue == word` as "no clue available"). The `source` / `source_license` columns describe the **word** provenance (grammalecte, MPL-2.0) — the clue's CC0 LoRA provenance is not surfaced per-field today.

### Hard-won inflation gotchas (fixed in PR #192 + #193 — keep regressions out)

- **Pleonasms in LoRA output propagate via inflation.** iter10 emitted `unir → "Associer ensemble"`; the agreement-aware inflater then faithfully propagated that tautology across **116 surface forms** before anyone noticed. The fix is a closed-set `_find_pleonasm` gate in `validate_clue.py` (`pleonasm` flag) that catches `X + ensemble` for join-verbs, `monter + en haut`, `prévoir + à l'avance`, etc. **Don't widen the gate by analogy** — the closed set is exactly the patterns documented as failures; broader heuristics false-positive on legitimate clues.
- **Syncretic surface tags need paradigm-row splitting.** Grammalecte stores syncretic surface forms on a single row with the *union* of mood/person tags (`unis` carries `{ipre, 1sg, 2sg}`; `accompagne` carries `{ipre, spre, 1sg, 3sg, impe, 2sg}`). The matcher used to require the head verb's paradigm to have one row matching the entire union — irregular verbs whose paradigms split the same syncretism across separate rows (`rends` ipre vs `rende` spre on different rows) returned `no-inflection`. PR #193 changed the matcher to split on tag dimensions; preserve that behaviour.
- **`inv` (invariable) and `epi` (epicene) act as wildcards on either side of the matcher.** `pris` is `{ppas, mas, inv}`; `appartenu` is `{ppas, epi, inv}`. Treat these tags as compatible with anything in their dimension; treating them as hard tags re-introduces a flood of `no-inflection`.
- **`non` head-ranker bug.** Grammalecte tags `non` as both adverb AND mas-inv noun. The naive head ranker captured `Non` as a noun head in clues like `Non présent`; downstream agreement then inherited its `inv` and mis-agreed every following adjective. The fix demotes `non`-as-noun in the head-ranking step — preserve that demotion list and add to it on the same evidence pattern, not on hunches.
- **Defective paradigms are legitimate `no-inflection`.** Some verbs (`soustraire`'s passé simple) have empty grammalecte cells. Ship the lemma form as-is rather than dropping the row or hallucinating a form. The 6 residual `no-inflection` rows in the iter10 export are the canonical example.

### Runtime guard

`scripts/eval/test_runtime_csv_pleonasms.py` is the regression test that asserts:
1. No row in the shipped `grid/api/src/main/resources/words/words-fr.csv` trips `validate_clue._find_pleonasm`.
2. `lemma_clues_shipped.csv` and `surface_clues.csv` both hold zero pleonasm rows.

It's the gate against the "merged-but-not-validated artefact" failure mode (someone hand-edits the CSV and skips the validator). It runs as part of `pytest scripts/eval/`. If it fires, run `python scripts/clue_generation/strip_pleonastic_clues.py` and re-export — don't silence the test.

### Where to plug a new validator rule

A new structural failure mode shows up in three places, in this order:
1. Add the detector + flag value to `scripts/eval/validate_clue.py` (and a unit test under `scripts/eval/test_validate_clue.py`).
2. Wire the flag into the gate in `generate_clues_lora_batched.py` so the production pipeline drops the row before scoring.
3. If the failure mode can sneak past at the surface tier (i.e. a clean lemma clue inflates into a regression — see the pleonasm case), add a runtime guard analogous to `test_runtime_csv_pleonasms.py` over the committed CSV.

Skipping step 3 is what bit PR #192. The validator gate caught new generations, but the existing surface table had already absorbed the bad lemma-form clues; only a runtime test over the committed artefact catches that.

## Synonym derivation — the free-win lane

`bliss-worker derive-synonym-clues` runs the SQL derivation per ADR-0024:

```sql
upper(left(syn.synonym_lemma, 1)) || substring(syn.synonym_lemma, 2)
```

This emits a `clue_candidates` row with `source = 'dbnary-synonym'` for every (lemma, synonym) pair that has the right grammalecte head + matching POS + token frequency above the threshold. The Python prototype lives at `scripts/eval/synonym_clues.py` (single-word preference, freq ≥ 1000 per token, skip parenthesised / hyphenated forms) and the production path is the SQL inside the worker — keep them in sync if you change the picker rules.

The two-source design is deliberate: the synonym lane covers ~30% of nouns at zero cost, and the LLM-generated lane covers the rest. `findTopBySourcePriority` picks per lemma. Don't merge the lanes; don't let the synonym lane's lower-quality picks pre-empt a strong LLM clue.

## `bliss-worker` bridge (Kotlin side)

Subcommands relevant to clue-AI work — see `grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt`:

- `ingest-dbnary` — parses `data/dbnary/dbnary_fr.csv` into the `dbnary` table.
- `derive-synonym-clues` — SQL-only synonym derivation per ADR-0024.
- `ingest-clue-candidates` — bulk-loads the LoRA-generated CSV into `clue_candidates`. Required columns: `lemma, clue_text, source`. Optional: `model_version, confidence`. `--truncate` deletes existing rows for the given `--source` before inserting (idempotent re-runs); `--source <override>` and `--model-version <override>` set those columns globally. **This is the only ingestion path for LoRA output** — there's no in-worker generation lane.
- `export-words` — selects the per-lemma top candidate per `findTopBySourcePriority`, writes the committed CSV (`grid/api/src/main/resources/words/words-<lang>.csv`). Sorted by `(language, word)` for stable git diffs. Idempotent.

Cross-layer rules in this corner are the same as for the rest of the JVM backend (see the `jvm-backend` skill): `domain` types like `ClueCandidate` are pure Kotlin, `application` defines the ports, `infrastructure` provides JDBC adapters, `worker` wires Clikt subcommands to use cases.

## Common failure modes (and where they live)

Rows mentioning LoRA/DPO training runs, the filter, or
`run_production.sh` are MLX-era — kept because the training lessons
transfer to the Modal trainer; do not act on them by running MLX
scripts (ADR-0087).

| Symptom | Cause | Fix |
|---|---|---|
| Filter score collapses across the board after retraining | Triplet corpus regenerated with held-out lemmas leaking into train | Re-check `held_out` set against `eval_human.jsonl` in `train_filter_v5.py`. |
| LoRA `val_loss` plateaus then climbs | Overfit on small corpus (iter8 hit this at iter 200 on 85 train pairs) | Promote the best-val-loss adapter; lower lr or fewer iters next run. |
| DPO run goes sideways (acceptance regression) | DPO lr set to SFT lr (1e-5 vs 1e-6 expected) | Lower lr to ~1e-6, β = 0.1, sigmoid loss; resume from SFT adapter, not from scratch. |
| `unknown-head` flags spike | grammalecte lexique not loaded / wrong path | `morphology_index.py` defaults; verify the file at `data/lexique-grammalecte-fr-v7.7.txt`. |
| Stem-leak rule firing on legitimate clues | LCP threshold too low (e.g. dropped to 4) | Restore to 5; add a counter-example to the iter7 variance check before changing. |
| `bliss-worker ingest-clue-candidates` fails on a row | CSV missing required column or non-UTF-8 | Required: `lemma, clue_text, source`. Use UTF-8 (`StandardCharsets.UTF_8` is what the worker expects). |
| `export-words` produces a different CSV on rerun | Tie-break in `findTopBySourcePriority` not deterministic | Fix the SQL ordering: priority, then `created_at`, then `id`. ADR-0013 §7 idempotency is non-negotiable. |
| LoRA inference 10× slower than baseline | Prompt grew (anti-pattern exemplars added back) | iter8+ prompts are intentionally tiny (~30 tokens) — the LoRA learned the style. Keep prompts short. |
| Production-run script killed mid-batch | Normal — phase 1 / 2 / 3 are independently resumable | Re-run `run_production.sh`; phase 1 reuses sample.jsonl, phase 2 picks up incremental progress. |
| Acceptance number swings 7pp between runs | N=80 single-candidate variance | Scale to 200+ lemmas, N=3 per lemma, best-of-3. Anything smaller is unmeasurable noise. |
| `inflection_status` flood of `no-inflection` after a morphology change | Matcher requiring whole-union match on syncretic surface tags | Restore PR #193's per-dimension splitting; do not require one paradigm row to satisfy the surface's full tag union. |
| Surface clue regresses with `inv` / `epi` mismatches | These tags treated as hard constraints in `MorphologyIndex.inflect` | Treat `inv` and `epi` as wildcards on either side of the matcher. |
| Adjective agreement breaks across a clue starting with `Non …` | Head ranker captured `Non` as a mas-inv noun; downstream tokens inherited `inv` | Demote `non`-as-noun in the head-ranking step. |
| Pleonastic clue ships in the runtime CSV | A bad lemma-form clue inflated cleanly across 100+ surfaces | Add the pattern to `_find_pleonasm` in `validate_clue.py`, regenerate, then run `strip_pleonastic_clues.py` to scrub the existing CSV. |

## Don'ts

- **Don't** bake any DBnary `definition_text` into a CSV that ships, into `clue_candidates.clue_text`, or into a LoRA training pair. ADR-0023 constraint #1.
- **Don't** emit a lower-case DBnary `synonym_lemma` as `clue_text`. ADR-0024 only authorises the **capitalized** form, and only when paired with `source = 'dbnary-synonym'`.
- **Don't** extend the ADR-0024 relaxation by analogy (e.g. "if synonyms are fine, glosses must be too"). They aren't. New surfaces require a new ADR + legal review.
- **Don't** commit large weights or full corpus dumps under `data/` or `models/` — those paths are gitignored at scale; only the rated eval CSVs that back a logbook iter row belong in git.
- **Don't** invoke the MLX lane — no `mlx_lm.*`, no `run_production.sh`, no `train_lora.sh`/`train_dpo.sh`, no new `lora_iter*.yaml`. ADR-0087. Generation and training go through Modal (`modal_jobs/`).
- **Don't** add a *deployed/runtime* hosted-LLM call without an ADR. Batch usage is established (Modal generation per ADR-0057, LLM-as-judge per round-11), but the product itself never calls an LLM — the prod read path is the committed CSV (ADR-0013 §8).
- **Don't** bump the `command-r-08-2024` base model without an ADR + re-training all downstream adapters and re-running the eval. Adapters are model-specific.
- **Don't** swap SFT and DPO learning rates. SFT ≈ 1e-5, DPO ≈ 1e-6. Wrong LR silently destroys the model.
- **Don't** promote the last-iteration adapter. Always promote best-val-loss — train loss keeps falling on small corpora.
- **Don't** re-gate Command-R output with the MLX-era `validate_clue` at fold time — it false-flags valid Command-R clue shapes (ppas / relative-clause / noun-phrase heads); trust the `pipeline_v2` flags instead (round-12 logbook entry). `validate_clue` stays authoritative only for the runtime pleonasm guard.
- **Don't** lower the stem-leak threshold from 5 chars without rerunning the 5-sample variance check.
- **Don't** silently overwrite an iter/round row in `docs/eval/clue-gen-v0.md`. Append the new round; the logbook is the project memory for what's been tried.
- **Don't** compare self-rated and user-rated acceptance numbers directly — there's a ~10pp calibration gap.
- **Don't** mix the LLM lane and the dbnary-synonym lane into a single `clue_candidates.source` value. The two-source design is what `findTopBySourcePriority` relies on.
- **Don't** replace shipped clues with a full-rebuild merge. Merge **additively** (fill blank placeholders only) — the round-12 full-rebuild attempt would have dropped 5.3k shipped clues and erased prior curated fixes.
- **Don't** generate clues at surface form. The pipeline assumes lemma-form generation + head-token inflation at build time; surface-form generation breaks the dedup that lets one lemma clue cover all of its inflected surfaces.
- **Don't** widen `_find_pleonasm`'s pattern set on intuition. Add a pattern only when there's a concrete failed clue to back it; broad heuristics false-positive on legitimate two-phrase clues.
- **Don't** treat `inv` (invariable) or `epi` (epicene) as hard tags in `MorphologyIndex.inflect`. They are wildcards on either side of the matcher. PR #193 fixed this; don't regress it.
- **Don't** require a single paradigm row to satisfy a syncretic surface's full tag union. Match per dimension. PR #193 fixed this; don't regress it either.
- **Don't** silently swallow `head-pos-mismatch` / `no-owner` / `no-inflection` rows in `build_surface_clues.py`. They mean the surface is shipping with a placeholder or skipped — surface them in the build summary so a human can decide whether to regenerate at the missing POS.
- **Don't** skip `pytest scripts/eval/` before merging a PR that touches `validate_clue.py`, `inflect_clue.py`, `morphology_index.py`, `build_surface_clues.py`, or the committed `words-fr.csv`. The pleonasm runtime guard lives there and is the only thing standing between a hand-edit and a regression on the live grid.
