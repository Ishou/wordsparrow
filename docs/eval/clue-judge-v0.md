# Clue-judge eval logbook

Per the clue-judge design spec §11 (traceability): one row per judge
version. Append, never overwrite. Each row records backbone choice,
pair-extraction date + campaign range, held-out set hash, and the
offline eval numbers (spec §6).

The judge is a **pre-filter, not a reward** (spec §2). It ships in
**shadow mode** (scores logged, nothing rejected); held-out numbers gate
the later *enforcement* flip, not shadow logging.

---

## judge-v1 — 2026-06-02

**Method:** logistic-regression probe (`C=0.05`, lemma-grouped
`GroupKFold`) over frozen sentence-embeddings.
`feat = [emb(clue), emb(clue) − emb(lemma), style_onehot(style)]`,
chosen=1 / rejected=0.

**Corpus:** `pair_ratings` only — 126 pairs, 50 lemmas, balanced 63/63.
- **Correctifs excluded by design.** The human-rewritten side is off the
  generator's distribution and is often a style fix; that signal belongs
  to RAFT (`extract_winners.py`), not the judge. This overrides the
  original spec §3 (which paired both sources) — see the 2026-06-02 spec
  amendment. Measured basis: an exploratory combined run (126 pair + 220
  correctif) scored held-out AUROC 0.554; dropping correctifs raised it
  to 0.575 despite halving the data, consistent with a human-vs-model
  surface confound that does not transfer to the all-model held-out set.
- Pair-extraction date: 2026-06-02, from the read-only survey standby.
- Campaign range: none — the maintainer's `pair_ratings` carry no
  `campaign_id` in the current DB, so spec §8 recency-weighting has no
  basis yet (flag for Phase B).
- 60 held-out lemmas (`eval_human.jsonl`) excluded from training.
- `judge_pairs.jsonl` sha256: `3b94fc3b…04c230ad`.

**Backbone bake-off** (CV AUROC, lemma-grouped): `camembert-base`
**0.591** vs `filter-camembert-v5` 0.451 → **camembert-base** kept.
v5's relevance objective is misaligned with quality (spec §5
prediction confirmed; v5 lost in every config tried).

**Held-out eval** (`eval_human.jsonl`, 246 rows, sha256
`c22a94e3…96e9f6a2`):
- Pointwise AUROC (y vs not-y): **0.575**
- Constructed (y>n) paired accuracy: 0.466 — underpowered (few same-lemma
  y/n pairs constructible from 246 rows); within noise of 0.5, not a
  usable signal at this set size.

**Read honestly:** 0.575 is weak. It is the true in-distribution signal
from a small clean corpus (the spec calls ~181 pairs "marginal"; this is
126). Adequate to start shadow logging; **not** adequate to derive an
enforcement threshold. The path up is the Phase-B flywheel (more pairs
per round + calibration against live ratings), not a bigger static set.

**Caveats on the held-out yardstick:**
- `eval_human.jsonl` carries no `style` field, so it can only measure the
  judge **style-blind**. Experiment: style conditioning moved held-out
  AUROC by ≤0.003 (0.575 conditioned vs 0.575 blind on this corpus), so
  the gap above is *not* a style-blindness artifact — but a
  style-carrying held-out set would be needed before style conditioning
  can be evaluated on its merits.
- The set is absolute y/b/n ratings on 60 lemmas disjoint from the 50
  training lemmas — a deliberately hard generalization test.

**Artifact:** `models/clue-judge-v1/` (`probe.joblib` + `metadata.json`;
gitignored). Backbone loaded by HF id `camembert-base`.

**Status:** trained, evaluated, **not yet wired**. Pipeline integration
(`filter_8` shadow load) is a separate step, deliberately paused.
