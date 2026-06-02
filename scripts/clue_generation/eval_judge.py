"""Offline judge eval: held-out pointwise AUROC + constructed (y>n) paired accuracy (spec §6)."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from sklearn.metrics import roc_auc_score

RATING_RANK = {"y": 2, "b": 1, "n": 0}


def auroc(scores: list[float], labels: list[int]) -> float:
    """AUROC of good(=1) vs not-good(=0); thin wrapper for testability."""
    return float(roc_auc_score(labels, scores))


def construct_pairs(rows: list[dict]) -> list[tuple[str, str]]:
    """Per lemma, build (y-candidate, n-candidate) ordered pairs from absolute ratings."""
    by_lemma: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"y": [], "n": []})
    for r in rows:
        if r["rating"] in ("y", "n"):
            by_lemma[r["lemma"]][r["rating"]].append(r["candidate"])
    pairs: list[tuple[str, str]] = []
    for buckets in by_lemma.values():
        for good in buckets["y"]:
            for bad in buckets["n"]:
                pairs.append((good, bad))
    return pairs


def paired_accuracy(pairs: list[tuple[str, str]], scores: dict[str, float]) -> float:
    """Fraction of (good, bad) pairs the judge orders correctly (good scored strictly higher)."""
    if not pairs:
        return float("nan")
    correct = sum(1 for good, bad in pairs if scores[good] > scores[bad])
    return correct / len(pairs)


def _load_rows(path: Path) -> list[dict]:
    """Read the held-out JSONL."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def main(argv: list[str] | None = None) -> int:
    """CLI: load the judge artifact, score the held-out set, print AUROC + paired accuracy."""
    from .pipeline_v2.judge import Judge

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--judge-dir", type=Path, default=Path("models/clue-judge-v1"))
    parser.add_argument("--held-out", type=Path, default=Path("data/lora_filter/eval_human.jsonl"))
    args = parser.parse_args(argv)

    rows = _load_rows(args.held_out)
    judge = Judge.load(args.judge_dir)
    # eval_human has no style column → score with empty style (style-blind on held-out).
    scores = {r["candidate"]: judge.score(r["lemma"], r.get("style", ""), r["candidate"]) for r in rows}

    labels = [1 if r["rating"] == "y" else 0 for r in rows]
    score_list = [scores[r["candidate"]] for r in rows]
    a = auroc(score_list, labels)
    pa = paired_accuracy(construct_pairs(rows), scores)
    print(f"held-out AUROC (y vs not-y): {a:.3f}", file=sys.stderr)
    print(f"constructed (y>n) paired accuracy: {pa:.3f}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
