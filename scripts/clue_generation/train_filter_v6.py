#!/usr/bin/env python3
"""Filter v6: v5's corpus (replay) + mined historical-reject failures.

v5 is near-blind to truncated/hallucinated clues (`"R"`, `"Dé"` score ~1.0 vs
the lemma). This adds the failures mined from `historical_reject_pairs.csv` —
but ONLY the pairs v5 actually gets wrong (bad >= good), and MIXED with v5's
existing corpus as replay so the model doesn't forget what it already ranks
correctly (training on failures alone regresses the known-good set ~8pp).

Evaluation is built in and gates shipping:
- held-out failure test (lemmas never trained) — the target improvement;
- regression set (pairs v5 already got right) — must stay high;
- eval_human.jsonl (246 human ratings) — the canonical ship gate.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SEED = 20260504


def build_replay_triplets(data: Path, held_out: set[str]) -> list[tuple[str, str, str]]:
    """v5's corpus: same-lemma (y,n) from round2/active + iters, + cross-lemma."""
    triplets: list[tuple[str, str, str]] = []
    by_lemma: dict[str, dict[str, str]] = defaultdict(dict)
    for src in [data / "lora" / "round2_rated.csv", data / "lora" / "active" / "all_rated.csv"]:
        if not src.exists():
            continue
        for r in csv.DictReader(src.open(encoding="utf-8")):
            lemma = (r.get("lemma") or "").strip().lower()
            clue = (r.get("lemma_clue") or "").strip()
            rating = (r.get("rating") or "").strip().lower()
            if lemma and clue and rating in ("y", "n") and lemma not in held_out:
                by_lemma[lemma][rating] = clue
    for lemma, it in by_lemma.items():
        if "y" in it and "n" in it:
            triplets.append((lemma, it["y"], it["n"]))
    iter_by_lemma = defaultdict(list)
    for path in sorted((data / "eval").glob("lemma_clues_iter*.csv")):
        for r in csv.DictReader(path.open(encoding="utf-8")):
            lemma = (r.get("lemma") or "").strip().lower()
            clue = (r.get("lemma_clue") or "").strip()
            rating = (r.get("rating") or "").strip().lower()
            if lemma and clue and rating in ("y", "b", "n") and lemma not in held_out:
                iter_by_lemma[lemma].append((rating, clue))
    for lemma, items in iter_by_lemma.items():
        ys = [c for r, c in items if r == "y"]
        for y in ys:
            for r, c in items:
                if r in ("b", "n"):
                    triplets.append((lemma, y, c))
    rng = random.Random(SEED)
    y_pairs = [(l, it["y"]) for l, it in by_lemma.items() if "y" in it]
    y_pairs += [(l, c) for l, items in iter_by_lemma.items() for r, c in items if r == "y"]
    for lemma, y in list(y_pairs):
        other = rng.choice(y_pairs)
        if other[0] != lemma:
            triplets.append((lemma, y, other[1]))
    return triplets


def rank_acc(model, rows, util) -> float:
    if not rows:
        return 0.0
    le = model.encode([r[0] for r in rows], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    ge = model.encode([r[1] for r in rows], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    be = model.encode([r[2] for r in rows], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    ok = sum(float(util.cos_sim(le[i], ge[i])) > float(util.cos_sim(le[i], be[i])) for i in range(len(rows)))
    return 100 * ok / len(rows)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", type=Path, default=REPO / "models" / "filter-camembert-v2")
    p.add_argument("--v5", type=Path, default=REPO / "models" / "filter-camembert-v5")
    p.add_argument("--out", type=Path, default=REPO / "models" / "filter-camembert-v6")
    p.add_argument("--data", type=Path, default=REPO / "data")
    p.add_argument("--epochs", type=int, default=4)
    p.add_argument("--failure-weight", type=int, default=3,
                   help="replicate each mined failure triplet N times vs replay")
    args = p.parse_args()

    from sentence_transformers import InputExample, SentenceTransformer, losses, util
    from torch.utils.data import DataLoader

    held_out = {json.loads(l)["lemma"].lower()
                for l in (args.data / "lora_filter" / "eval_human.jsonl").open(encoding="utf-8")}

    # Mine v5's failures from the harvested pairs (held-out lemmas excluded).
    v5 = SentenceTransformer(str(args.v5))
    pairs = [r for r in csv.DictReader((args.data / "lora_filter" / "historical_reject_pairs.csv").open(encoding="utf-8"))
             if r["lemma"] not in held_out]
    le = v5.encode([r["lemma"] for r in pairs], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    ge = v5.encode([r["good"] for r in pairs], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    be = v5.encode([r["bad"] for r in pairs], convert_to_tensor=True, normalize_embeddings=True, batch_size=128)
    failures, v5_correct = [], []
    for i, r in enumerate(pairs):
        (failures if float(util.cos_sim(le[i], be[i])) >= float(util.cos_sim(le[i], ge[i])) else v5_correct).append(
            (r["lemma"], r["good"], r["bad"]))
    # split failures by lemma so the test set is genuinely held out
    fail_lemmas = sorted({t[0] for t in failures})
    test_lemmas = set(fail_lemmas[::5])
    fail_train = [t for t in failures if t[0] not in test_lemmas]
    fail_test = [t for t in failures if t[0] in test_lemmas]
    print(f"pairs={len(pairs)} v5-failures={len(failures)} (train={len(fail_train)} test={len(fail_test)}) "
          f"v5-correct(regression set)={len(v5_correct)}")

    replay = build_replay_triplets(args.data, held_out)
    train = replay + fail_train * args.failure_weight
    random.Random(SEED).shuffle(train)
    print(f"replay triplets={len(replay)}  failure×{args.failure_weight}={len(fail_train) * args.failure_weight}  total train={len(train)}")

    model = SentenceTransformer(str(args.base))
    loader = DataLoader([InputExample(texts=list(t)) for t in train], shuffle=True, batch_size=16)
    args.out.mkdir(parents=True, exist_ok=True)
    model.fit(train_objectives=[(loader, losses.TripletLoss(model, triplet_margin=0.3))],
              epochs=args.epochs, warmup_steps=100, output_path=str(args.out), show_progress_bar=False)

    v6 = SentenceTransformer(str(args.out))

    # eval_human ship gate — robust metrics over ALL 246 rows (not just same-lemma
    # triplets): mean cos per rating bucket (should be monotonic y>b>n) and AUROC
    # = P(score(random y) > score(random n)) over every y×n cross pair.
    eh = [json.loads(l) for l in (args.data / "lora_filter" / "eval_human.jsonl").open(encoding="utf-8")]
    for d in eh:
        d["s"] = float(util.cos_sim(
            v5.encode(d["lemma"], convert_to_tensor=True, normalize_embeddings=True),
            v5.encode(d["candidate"], convert_to_tensor=True, normalize_embeddings=True)))
    def eval_human(model):
        for d in eh:
            d["s"] = float(util.cos_sim(
                model.encode(d["lemma"], convert_to_tensor=True, normalize_embeddings=True),
                model.encode(d["candidate"], convert_to_tensor=True, normalize_embeddings=True)))
        buckets = {r: [d["s"] for d in eh if d["rating"] == r] for r in ("y", "b", "n")}
        ys, ns = buckets["y"], buckets["n"]
        auroc = sum(sy > sn for sy in ys for sn in ns) / (len(ys) * len(ns))
        means = {r: (sum(v) / len(v) if v else 0.0) for r, v in buckets.items()}
        return auroc, means

    a5, m5 = eval_human(v5)
    a6, m6 = eval_human(v6)
    print("\n=== ranks good>bad (%) — v5 -> v6 ===")
    print(f"  held-out failure test:        {rank_acc(v5, fail_test, util):5.1f} -> {rank_acc(v6, fail_test, util):5.1f}")
    print(f"  regression set (v5-correct):  {rank_acc(v5, v5_correct, util):5.1f} -> {rank_acc(v6, v5_correct, util):5.1f}")
    print("\n=== eval_human ship gate (246 rows) — v5 -> v6 ===")
    print(f"  AUROC (y vs n):   {a5:.3f} -> {a6:.3f}")
    print(f"  mean cos  y/b/n:  {m5['y']:.3f}/{m5['b']:.3f}/{m5['n']:.3f} -> {m6['y']:.3f}/{m6['b']:.3f}/{m6['n']:.3f}")


if __name__ == "__main__":
    main()
