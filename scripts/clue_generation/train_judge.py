"""Train the clue-judge probe: embed pairs, GroupKFold CV, pick backbone, save artifact."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

import math

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

from . import judge_features as jf

BACKBONES = {
    "camembert-base": "camembert-base",
    "filter-camembert-v5": "models/filter-camembert-v5",
}


def train_probe(X: np.ndarray, y: np.ndarray, groups: np.ndarray,
                C: float = 0.05) -> tuple[LogisticRegression, float]:
    """Lemma-grouped CV AUROC, then fit on all data. Returns (fitted clf, mean CV AUROC)."""
    n_groups = len(set(groups.tolist()))
    n_splits = min(5, n_groups)
    gkf = GroupKFold(n_splits=n_splits)
    aurocs: list[float] = []
    for train_idx, test_idx in gkf.split(X, y, groups):
        clf = LogisticRegression(C=C, max_iter=1000)
        clf.fit(X[train_idx], y[train_idx])
        scores = clf.decision_function(X[test_idx])
        if len(set(y[test_idx].tolist())) > 1:
            aurocs.append(roc_auc_score(y[test_idx], scores))
    final = LogisticRegression(C=C, max_iter=1000).fit(X, y)
    return final, (float(np.mean(aurocs)) if aurocs else float("nan"))


def _embed(model: Any, texts: list[str]) -> np.ndarray:
    """Encode texts → ndarray; isolated so it can be swapped/mocked."""
    return np.asarray(model.encode(texts, show_progress_bar=False))


def _build_matrix(model: Any, records: list[dict],
                  styles: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Embed clues + lemmas, assemble feature matrix X, labels y, group ids."""
    clues = [jf.normalize_clue(r["clue"]) for r in records]
    lemmas = [r["lemma"] for r in records]
    emb_c = _embed(model, clues)
    emb_l = _embed(model, lemmas)
    X = np.vstack([
        jf.feature_vector(emb_c[i], emb_l[i], jf.style_onehot(records[i]["style"], styles))
        for i in range(len(records))
    ])
    y = np.array([r["label"] for r in records])
    lemma_ids = {lem: i for i, lem in enumerate(sorted(set(lemmas)))}
    groups = np.array([lemma_ids[r["lemma"]] for r in records])
    return X, y, groups


def _load_records(path: Path) -> list[dict]:
    """Read the extractor JSONL."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def _held_out_lemmas(path: Path) -> set[str]:
    """Lemmas reserved for held-out eval; must never enter training."""
    if not path.exists():
        return set()
    return {r["lemma"] for r in _load_records(path) if r.get("lemma")}


def exclude_held_out(records: list[dict], held_out: set[str]) -> list[dict]:
    """Drop training pairs whose lemma is reserved for held-out evaluation."""
    return [r for r in records if r["lemma"] not in held_out]


def main(argv: list[str] | None = None) -> int:
    """CLI: exclude held-out lemmas, train on judge pairs, compare backbones, save best artifact."""
    from sentence_transformers import SentenceTransformer

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pairs", type=Path, default=Path("data/lora_filter/judge_pairs.jsonl"))
    parser.add_argument("--held-out", type=Path,
                        default=Path("data/lora_filter/eval_human.jsonl"))
    parser.add_argument("--out-dir", type=Path, default=Path("models/clue-judge-v1"))
    parser.add_argument("--C", type=float, default=0.05)
    args = parser.parse_args(argv)

    records = _load_records(args.pairs)
    held_out = _held_out_lemmas(args.held_out)
    records = exclude_held_out(records, held_out)
    styles = sorted({r["style"] for r in records if r["style"]})

    best = None
    for name, ref in BACKBONES.items():
        if not (ref == "camembert-base" or Path(ref).exists()):
            print(f"skip backbone {name}: {ref} not present", file=sys.stderr)
            continue
        model = SentenceTransformer(ref)
        X, y, groups = _build_matrix(model, records, styles)
        clf, auroc = train_probe(X, y, groups, C=args.C)
        print(f"backbone {name}: CV AUROC {auroc:.3f}", file=sys.stderr)
        if best is None or math.isnan(best[1]) or auroc > best[1]:
            best = (name, auroc, clf)

    if best is None:
        raise SystemExit("ERROR: no backbone available to train.")

    name, auroc, clf = best
    args.out_dir.mkdir(parents=True, exist_ok=True)
    import joblib
    joblib.dump(clf, args.out_dir / "probe.joblib")
    (args.out_dir / "metadata.json").write_text(json.dumps({
        "backbone": name, "backbone_ref": BACKBONES[name],
        "styles": styles, "C": args.C,
        "cv_auroc": auroc, "n_records": len(records),
        "n_lemmas": len({r["lemma"] for r in records}),
        "n_held_out_lemmas": len(held_out),
        "trained_on": date.today().isoformat(),
        "held_out_set": str(args.held_out),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved judge: backbone={name} cv_auroc={auroc:.3f} → {args.out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
