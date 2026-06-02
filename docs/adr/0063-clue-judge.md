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
generator training (this PR also fixes a silent path bug that defeated
that exclusion — see ADR-0058 data matrix).

## Consequences
- Easier: human rating load drops once enforcement flips; the reject pile
  becomes a measurable drift signal (Phase B).
- Harder: a stale judge can exert "conservative drag" (prune novel-but-
  good clues). Mitigated by a deliberately loose threshold and a reject-
  pile audit, not by closing the loop.
- Companion spec: `docs/superpowers/specs/2026-06-02-clue-judge-design.md`.
  Phase B (flywheel) is a separate plan.

## Data licence (ADR-0058 matrix)
No new external data source. Training pairs come from the survey DB
(maintainer-authored). CamemBERT backbone is the same one used by the
existing filter lane. No DBnary definitions enter the judge artifact.
