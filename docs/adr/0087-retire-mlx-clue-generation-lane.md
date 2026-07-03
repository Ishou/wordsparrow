# ADR-0087: Retire the local MLX clue-generation lane

## Status
Accepted (2026-06-23 decision, codified 2026-07-03)

## Context
The clue-AI pipeline started as a fully local lane on Apple Silicon:
mlx-lm LoRA/DPO on `c4ai-command-r-08-2024-4bit`, the CamemBERT
bi-encoder filter, and `run_production.sh` (ADR-0013, iterated through
iter18 in `docs/eval/clue-gen-v0.md`). ADR-0057 later added a Modal
cloud-GPU lane, initially framed as training-only and secondary.

By June 2026 the Modal Command-R fork had become the only lane
producing shipped clues: rounds 10–12 were generated on Modal
(`modal_jobs/04_generate_command_r.py`, `raft-round-10` adapter),
gated by `pipeline_v2` filters plus an LLM judge — the round-11 eval
showed the CamemBERT filter is mis-calibrated for this lane (AUROC
0.73; no bi/cross-encoder replicated LLM judgment at the available
label budget). The MLX lane was abandoned on 2026-06-23, but the
skill, runbook, and scripts still described it as "the
production-shipping path today", causing fresh agent sessions to
reach for mlx-lm by default.

## Decision
The **Modal Command-R lane is the sole clue-generation and training
lane**. The local MLX lane (mlx-lm training + inference:
`run_production.sh`, `train_lora.sh`, `train_dpo.sh`,
`generate_clues_lora*.py`, `lora_iter*.yaml`) is **retired**: never
invoke it for new work; its scripts carry a hard-stop guard
(`FORCE_MLX=1` overrides, for archaeology only). The CamemBERT filter
is likewise retired as a shipping gate — `pipeline_v2` + LLM judge is
the gate (round-11 logbook entry).

Lane-independent tooling remains live and supported: `validate_clue.py`
(runtime pleonasm guard + `pytest scripts/eval/`),
`build_surface_clues.py` / `inflect_clue.py` (lemma→surface inflation),
`merge_clues_into_wordlist.py`, the DBnary synonym lane, and the
`bliss-worker` bridge. ADR-0013's committed-CSV production read path
and ADR-0023/0024 licence constraints are unchanged.

This amends ADR-0057 ("second training lane", "training-only"): the
Modal lane is now first and only, and covers generation as well as
training.

## Consequences
- One lane, one counter set (`modal_corpus_vN` + RAFT `round-N`);
  the MLX `iterN` ladder is frozen history in the eval logbook.
- Agent-facing docs (clue-ai skill, clue-loop runbook, style guide)
  describe only the Modal lane; MLX content is marked retired, kept
  for provenance of still-live rules (stem-leak threshold, pleonasm
  set, eval methodology).
- Regenerating or retraining requires Modal credits and network; there
  is no offline fallback lane anymore.
- The Mistral-Nemo Modal fork stays dormant (round-1 only), available
  for A/B if ever needed.
