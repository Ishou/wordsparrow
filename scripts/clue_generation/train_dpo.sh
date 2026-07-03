#!/usr/bin/env bash
# Wrapper for mlx-lm-lora DPO training. The -u flag forces unbuffered stdout
# so `tqdm.write` calls (Val loss, Iter loss, save messages) flush
# immediately into the log file instead of being block-buffered until the
# process exits. Without -u, val results are invisible mid-train.
#
# Usage:
#   bash scripts/clue_generation/train_dpo.sh \
#       --config scripts/clue_generation/lora_iter13_dpo.yaml \
#       --train --train-mode dpo \
#       --beta 0.1 --dpo-cpo-loss-type sigmoid \
#       2>&1 | tee /tmp/iter13_train.log
#
# All extra arguments are forwarded verbatim to mlx_lm_lora.train.
set -euo pipefail

# ADR-0087: MLX lane retired 2026-06-23 — training happens on Modal.
if [[ "${FORCE_MLX:-}" != "1" ]]; then
  echo "RETIRED (ADR-0087): the local MLX lane is retired. Train on Modal (modal_jobs/03b_finetune_command_r.py; see docs/runbooks/clue-loop.md). Set FORCE_MLX=1 only for archaeology." >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

PY="${PY:-.venv/bin/python}"
# `nice -n 15` deprioritizes CPU/IO scheduling for this process so the
# foreground apps stay responsive while training. Metal GPU still runs at
# full speed (nice doesn't apply to GPU work), but CPU/IO/memory
# contention drops noticeably. Override with NICE=0 if you need maximum
# throughput.
NICE_LEVEL="${NICE:-15}"
exec nice -n "$NICE_LEVEL" "$PY" -u -m mlx_lm_lora.train "$@"
