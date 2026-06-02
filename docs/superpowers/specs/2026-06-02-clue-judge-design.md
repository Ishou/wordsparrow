# Clue Judge — Design Spec

> Status: Proposed (2026-06-02). Companion plan:
> `docs/superpowers/plans/2026-06-02-clue-judge-phase-a.md`.
> Governs the Modal clue-generation lane (ADR-0057), the survey campaign
> system (ADR-0059), and the data-licence posture (ADR-0058).

## 1. Purpose & role

The Modal lane currently has **no semantic quality gate**. `filter_8`
(`scripts/clue_generation/pipeline_v2/filters.py`) is a stub
(`filter_8_llm_juge_mock`) that validates enums then always returns
`accept`; the accord heuristic in `llm_judge_mock.py` is defined but never
wired. The de-facto judge is the human rater in `/contribuer`.

The **judge** is a learned scorer that estimates whether a clue is GOOD for
a lemma, inserted as a **pre-filter** ahead of human rating. Its job is to
**reduce human rating load** by triaging obvious-bad before a human looks —
not to replace the human.

## 2. Architecture — the judge is a pre-filter, the human stays the reward

```
model[n-1] generates → JUDGE pre-filters → human rates survivors → winners (qualite=5) → SFT model[n]
```

The reward signal that produces training winners is **always the human**.
The judge never grades the data that becomes training data. This is a
binding design constraint, and it determines the entire risk profile:

- The generator is **not** optimized against the judge, so it cannot
  reward-hack the judge. Pleasing the judge buys nothing unless the human
  also says GOOD.
- Therefore judge **false positives are benign** (the human catches a bad
  clue that slipped through — minor wasted attention) and judge **false
  negatives are the real cost** (a good clue the judge wrongly rejects never
  reaches the human and is silently lost).
- The failure mode is **conservative drag** (a stale judge prunes novel-but-
  good clues), not reward hacking. This is why the deployment threshold is
  deliberately **loose** (§7) and why we audit the reject pile (§8).

**Non-goal — closed-loop automation.** The judge never becomes the reward.
Every fully-closed self-training loop in this space eventually needs a human
recalibration valve; removing it produces confident, fluent, wrong clues at
scale.

## 3. Training data

> **Amendment 2026-06-02 (supersedes the two-source design below).** The
> judge trains on **`pair_ratings` only**. Correctifs are excluded: the
> human-rewritten side is off the generator's distribution and is often a
> *style* fix, and an off-style-but-good clue is a generator-teaching
> signal (RAFT, via `extract_winners.py`), not a judge label. Measured
> basis: a combined run (126 pair + 220 correctif) scored held-out AUROC
> 0.554; dropping correctifs raised it to 0.575 despite halving the data
> — a human-vs-model surface confound that does not transfer to the
> all-model held-out set. The "Extractor overlap" dual-use note below no
> longer applies. See logbook `docs/eval/clue-judge-v0.md` (judge-v1).
> The campaign-scoping paragraph is also moot in practice: the current
> `pair_ratings` carry no `campaign_id`, so recency-weighting has no
> basis yet (Phase B must stamp pairs with a campaign first).

The judge trains on **same-word preference pairs** authored by the
maintainer. Two sources, both already in the survey DB:

1. **`pair_ratings`** (`/contribuer/pairs`): `left_wins`/`right_wins` give an
   **ordering** signal; `both_good`/`both_bad` give a **level** signal. As of
   2026-06-02: **67 maintainer pairs, all same-lemma, 53 distinct lemmas**.
   These are the *clean* source — both sides are model-generated, so the
   judge learns in-distribution discrimination with no human-style confound.
2. **Correctifs** (`ratings.proposed_item_id`): the maintainer's rewrite is
   `chosen`, the model's original is `rejected`. ~**114 non-trivial pairs,
   ~90 distinct lemmas** (after dropping punctuation/case-only edits). The
   `chosen` side is human-written, so it is slightly off the generator's
   distribution — useful as an *upper-quality anchor*, weaker as in-
   distribution signal.

Combined: **~181 pairs, ~143 distinct lemmas** before held-out exclusion
(§4). This is small. The MVP is sized accordingly (§5), and the Phase-B
flywheel (§8) exists to grow it.

**Scoping policy — cumulative, not campaign-scoped.** Judge pairs follow the
*correctif* pattern in `extract_winners.py`, not the *winner* pattern: the
judge trains on the full history of preference labels, **recency-weighted by
`campaign_id`** (lean toward recent pairs so the judge tracks the current
generator — see §8 "one step behind"). `pair_ratings` already carries
`campaign_id`, so provenance is free. The extractor does **not** inherit the
"refuse while campaign open" gate (that gate scopes RAFT winners to one
round); but in-round it is run **after** campaign close for a clean boundary.

**Extractor overlap (note for implementers):** correctif rows are *already*
read by `extract_winners.py` as RAFT gold winners. The judge extractor re-
reads the same rows in a different shape (paired with the original as
`rejected`). This is intentional dual-use, not duplication.

## 4. Held-out hygiene — the fixes (highest-priority)

The held-out set `data/lora_filter/eval_human.jsonl` (246 rows, 60 distinct
lemmas, y=165/b=45/n=36) is the **external non-regression guard**. A judge
optimized inside the loop cannot be its own guard; only a fixed external
yardstick catches the whole loop drifting.

**Fix 1 — broken manifest path.**
`data/lora/modal_corpus_v1/manifest.toml:15` declares
`exclude_lemmas_from = "data/eval/eval_human.jsonl"` — a path that **does not
exist**. The real file is `data/lora_filter/eval_human.jsonl`. Today this is
a **silent no-op**: ~54 of 60 held-out lemmas leak into the *generator*
training corpus. The test fixture
(`scripts/clue_generation/modal/test_build_modal_corpus.py:88`) writes to the
same wrong path, so green CI hides the bug.
→ Point both at `data/lora_filter/eval_human.jsonl`.
→ Consequence (by design): excluding the leaked lemmas changes the training
  corpus → bumps `modal_corpus_v1 → v2` → next round retrains. Flag in PR
  body; not a surprise.

**Fix 2 — the same bug must not reappear in the judge lane.** The judge
extractor (§Plan Task 2) and trainer (§Plan Task 3) **must exclude
`eval_human.jsonl` lemmas** from the judge training pairs, exactly as the
corpus builder does. Otherwise the judge trains on lemmas it is later
evaluated on → contaminated eval.

## 5. The MVP judge

**Method:** a **logistic-regression probe on frozen sentence-embeddings**,
proven in the 2026-06-02 spike (paired accuracy 0.333 → 0.711 vs the
misaligned cosine filters; pointwise AUROC 0.650 under lemma-grouped CV). A
linear model is the right capacity for ~181 pairs; a cross-encoder or
end-to-end fine-tune would overfit at this sample size (deferred, §9).

Two decisions the spike left open and the MVP must resolve:

- **Style conditioning.** The design (§8) requires the judge to condition on
  style, but the spike used only `(lemma, clue)` embeddings — it was
  **style-blind**. The MVP feature vector **includes style** (style is a
  generation input and free in the data): concatenate a style signal to the
  features. Verify the judge sees the candidate's `style`.
- **Backbone.** The spike sat on `models/filter-camembert-v5`, whose
  *relevance* objective is misaligned with quality. The trainer **compares
  base CamemBERT vs `filter-camembert-v5`** as the frozen backbone and picks
  the better held-out AUROC; do not assume v5.

**Feature recipe (from the spike, to extend with style):**
`feat(clue) = [emb(clue), emb(clue) − emb(lemma)]`, labels chosen=1 /
rejected=0, `LogisticRegression(C≈0.05)`.

## 6. Eval — offline metrics (corrected)

Two distinct offline measurements; **per-tier GOOD-rate is NOT here** — that
is an *online* metric (§8 / Phase B), measured on live rated candidates.

1. **Held-out pointwise ranking.** Score each `(lemma, candidate)` in
   `eval_human.jsonl`; report **AUROC** (good vs not-good, RATING_RANK
   y=2/b=1/n=0) and **Spearman**. This is the spike's 0.650 number.
2. **Held-out paired accuracy.** `eval_human.jsonl` is *absolute* ratings,
   so construct same-lemma **(y > n) pairs** from it and report the fraction
   the judge orders correctly. (Construction needed because the file has no
   explicit pairs; ~4 candidates/lemma makes this feasible.)
3. **In-sample paired accuracy** via lemma-grouped K-fold CV on the training
   pairs (the spike's 0.711) — a learnability check, reported alongside but
   not the deployment gate.

The deployment **threshold** (§7) is derived from metric (1)/(2): pick the
score cutoff with an acceptable held-out false-negative rate, biased loose.

## 7. Pipeline integration — shadow-first

Replace `filter_8_llm_juge_mock` with a call to the trained judge. **Ship in
shadow mode first** (CLAUDE.md "deploy dark, release bright"):

- **Shadow:** the judge **scores** every candidate and the score is logged,
  but `filter_8` still returns `accept` for all — nothing is rejected. This
  lets us measure the would-be reject pile against subsequent human ratings
  *before* the judge can starve the generator.
- **Enforce (later flip):** once the shadow reject pile's false-negative rate
  is acceptable, threshold loosely and actually reject below cutoff.

The judge artifact = a tiny linear head + a CamemBERT backbone reference. The
brief must specify where the pipeline loads it from (in-repo head + HF
backbone id, or Modal volume). A4 includes a **feature-correctness check**:
run the pipeline on sample lemmas and confirm good clues score high / bad
score low — not just unit tests.

## 8. Calibration flywheel (Phase B — separate plan)

Phase B grows the pair corpus and keeps the judge honest. It is **not a
prerequisite** for shipping judge v1; it is the flywheel the MVP turns on.

- **Persist `judge_score`** on candidates (schema-first migration) so the
  rating UI can tier by it.
- **Informed pair selection:** when building a pairs campaign, pick
  same-word + same-style candidates that **straddle judge tiers**
  (bad+mid, mid+top), tiered **per-lemma** (rank within a word's K
  candidates, since pairs must be same-word). Skip bad+top (trivial). The
  5-verdict pairs UI already captures ordering + level, so **no UI change**.
- **Drift metric (online):** per-tier GOOD-rate each round; bottom-tier
  GOOD-rate creeping up across rounds = the judge going stale ("one step
  behind" made measurable). The judge tracks the generator with a bounded
  one-round lag *if* pairs are re-labeled each round and recency-weighted.

The campaign layer needs **no new infrastructure**: campaigns are
mode-agnostic (`V7__campaigns.sql`), a single open campaign already spans
both binary and pair ratings (`campaigns_one_open` index, both submit use
cases call `campaigns.findOpen()`). Informed selection builds pairs *within*
the existing campaign.

## 9. Deferred / non-goals

- **Difficulty.** `force` is hardcoded `3` at generation; there is no
  difficulty signal to match or condition on. Difficulty is **empirical** —
  measure it later from **gameplay** (solve rate / time / hints), not from
  survey quality ratings (quality ⊥ difficulty), and not before player
  volume exists (product is pre-alpha). When real, it slots in as an
  additional conditioning feature — additive, no rework.
- **Cross-encoder / end-to-end fine-tune / LLM-judge.** Wait until the pair
  count justifies the capacity; overfits at ~181 pairs.
- **Closed-loop automation** (§2 non-goal).

## 10. Gating unknown — measure before building

The **eval_human ↔ judge-pair lemma overlap** is unmeasured and could change
the approach. Every overlapping lemma must be dropped from judge training
(§4 Fix 2), shrinking the already-marginal ~181 pairs. If overlap is heavy,
either the linear MVP loses too much data or the judge needs a *separate*
held-out set. **This is Task 0 of the plan** — a 2-minute read-only query
that gates the rest.

## 11. Traceability

Mirror the clue-ai discipline (adapter → corpus → manifest hash). The judge
artifact records: backbone choice, pair-extraction date + campaign range,
held-out set hash, and eval numbers. Append a **judge eval row** to a logbook
(extend `docs/eval/clue-gen-v0.md` or a new judge logbook) for every judge
version — never silently overwrite.

## 12. PR decomposition

**Phase A — ship the pre-filter (this spec's plan):**
A0 ADR · A1 held-out fix · A2 pair extractor · A3 trainer+eval (likely split
A3a/A3b) · A4 shadow-wire `filter_8`.

**Phase B — flywheel (separate plan, after A lands + overlap known):**
B1 persist `judge_score` (schema-first) · B2 informed pair selection ·
B3 online drift metric.

Parallel starts (development): A0, A1, A2 have no code inter-dependencies
and can be developed in separate worktrees simultaneously.
Merge ordering (process): A0 must merge before A2, A3, and A4 —
ADR-0001 §7 requires the ADR to land before code that introduces new
dependencies (A3: sentence-transformers/scikit-learn) or modifies the
production pipeline (A4). A1 is a bug fix and may merge independently.
Each PR: own worktree, `scripts/adr-context.sh` pre-read (ADR-0057/0058/0059),
DCO sign-off, one-line-comment discipline, ≤400-line cap (prefer A3a/A3b
split over cap-override).
