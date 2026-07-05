# ADR-0063: Learned clue quality judge (shadow pre-filter)

## Status
Accepted

## Context
The Modal clue-generation lane (ADR-0057) has no semantic quality gate.
`filter_8_llm_juge_mock` validates enums then always accepts; the human
rater in `/contribuer` is the de-facto judge. We want to reduce human
rating load by triaging obvious-bad clues before a human looks, without
letting an automated scorer become the reward signal (which would invite
reward hacking).

## Decision
Ship a learned **judge**: a logistic-regression probe over frozen
CamemBERT embeddings scoring `(lemma, style, clue)`, trained on
maintainer preference pairs (`pair_ratings` + correctifs) already in the
survey DB. It is inserted at `filter_8` as a **pre-filter ahead of human
rating** — the human stays the reward signal; the judge never grades the
data that becomes training data.

Phase A ships in **shadow mode**: the judge scores every candidate and
the score is logged, but `filter_8` still accepts everything. Enforcement
(actually rejecting below a loose threshold) is a later flip, gated on a
measured held-out false-negative rate.

Held-out hygiene: `data/lora_filter/eval_human.jsonl` lemmas are excluded
from judge training exactly as the corpus builder excludes them from
generator training (a companion fix in the judge-code PR corrects a
silent path bug that had defeated this exclusion — see ADR-0058 data
matrix).

## Consequences
- Easier: human rating load drops once enforcement flips; the reject pile
  becomes a measurable drift signal (Phase B).
- Harder: a stale judge can exert "conservative drag" (prune novel-but-
  good clues). Mitigated by a deliberately loose threshold and a reject-
  pile audit, not by closing the loop.

## Data licence (ADR-0058 matrix)
No new external data source. Training pairs come from the survey DB
(maintainer-authored). CamemBERT backbone is the same one used by the
existing filter lane. No DBnary definitions enter the judge artifact.

## Amendment (2026-07-05): Opus-as-judge is the committed ship gate

The learned CamemBERT probe never reached enforcement — held-out AUROC
plateaued at 0.73, too weak to gate on. Meanwhile the round-11/12 eval
work (`docs/eval/clue-gen-v0.md`) already used Opus-as-judge as the *de
facto* ship gate, applied as one-off labeling passes
(`data/eval/round11_opus_labels.csv`). This amendment formalizes that:
**the committed ship gate for a round is a real Anthropic Opus call, not
the probe.**

### Decision
- `scripts/clue_generation/pipeline_v2/llm_judge.py` is the committed
  gate: a batched Opus call over candidates that pass the deterministic
  `filter_1..10`, driven by a versioned rubric embedding the maintainer's
  finalized rulings (cross-lingual/foreign-sense, sense correctness with
  quality-over-quantity, inflection/agreement). It returns a structured
  **GOOD / BORDERLINE / BAD** verdict per `(lemma, clue)`.
- **Ship policy is GOOD-only.** GOOD → ship; BORDERLINE → curated-review
  sink; BAD → drop. It is a **batch gate over candidates, not an inline
  per-serve call.**
- The 3rd-person passé-simple carve-out matches the C-workstream inflater
  drop (`passe-simple-person` drops only 1st/2nd person), so the judge and
  inflater never contradict.
- The learned probe (`judge.py`, `filter_8_judge_shadow`) is **demoted to
  shadow only** — score-and-log, never gates. Not removed; it remains a
  drift signal.
- Not a new third-party service: the Anthropic API is the established
  judge from round-11. The API key is injected at runtime from the env,
  never committed.

### Calibration
`scripts/clue_generation/pipeline_v2/calibration_fixture.csv` pins the 8
cited maintainer rulings plus a stratified sample of
`round11_opus_labels.csv` with expected verdicts;
`test_llm_judge.py` asserts the verdict-parsing and GOOD-only ship routing
against a mock and, when `ANTHROPIC_API_KEY` is set, runs a live confusion
pass over the fixture (the operator's proof the rubric labels correctly).
