#!/usr/bin/env python3
"""Apply tightened homograph replacements (score_delta > 0.03, changed clue, Jaccard <= 0.7, re-validated `ok` against the row's own POS — not trusted from the diff's `new_flag`, the gap that let `score -> Obtenir` ship)."""
from __future__ import annotations
import argparse, csv, os, re, sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "eval"))
from morphology_index import MorphologyIndex  # noqa: E402
from validate_clue import validate_lemma_clue  # noqa: E402

TOKEN = re.compile(r"[a-zàâäæçéèêëîïôöœùûüÿ']+", re.IGNORECASE)


def jaccard(a: str, b: str) -> float:
    sa = {t.lower() for t in TOKEN.findall(a)}
    sb = {t.lower() for t in TOKEN.findall(b)}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def apply_replacements(
    rows: list[dict], diffs: list[dict], index: MorphologyIndex,
    min_delta: float = 0.03, max_jaccard: float = 0.7,
) -> dict[str, int]:
    """Mutate `rows` in place with the accepted homograph replacements. Each
    replacement lands only on the (lemma, pos) rows whose POS the new clue
    re-validates `ok` against — never on the diff's self-reported flag."""
    rows_by_lemma: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        rows_by_lemma[r["lemma"]].append(r)
    stats = defaultdict(int)
    for d in diffs:
        new, old = d["new_clue"], d["old_clue"]
        if not new or new == old:
            continue
        try:
            delta = float(d["score_delta"])
        except ValueError:
            continue
        if delta <= min_delta:
            stats["rejected_delta"] += 1
            continue
        if jaccard(old, new) > max_jaccard:
            stats["rejected_jaccard"] += 1
            continue
        applied = False
        for r in rows_by_lemma.get(d["lemma"], []):
            if not r.get("pos"):
                continue
            if validate_lemma_clue(new, d["lemma"], r["pos"], index).flag != "ok":
                continue
            r["lemma_clue"] = new
            r["filter_score"] = f"{float(d['new_score']):.4f}"
            r["validation_flag"] = "ok"
            applied = True
        stats["replaced" if applied else "rejected_flag"] += 1
    return stats


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path,
                   default=REPO / "data" / "eval" / "production" / "lemma_clues_raw_pos.csv")
    p.add_argument("--diff", type=Path,
                   default=REPO / "data" / "eval" / "production" / "homograph_fix.csv")
    p.add_argument("--dst", type=Path,
                   default=REPO / "data" / "eval" / "production" / "lemma_clues_raw_pos_fixed.csv")
    p.add_argument("--min-delta", type=float, default=0.03)
    p.add_argument("--max-jaccard", type=float, default=0.7)
    p.add_argument("--lexique", type=Path,
                   default=Path(os.path.expanduser(
                       "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt")))
    args = p.parse_args()

    index = MorphologyIndex.load(args.lexique)

    with args.src.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())
    with args.diff.open(encoding="utf-8", newline="") as f:
        diffs = list(csv.DictReader(f))

    stats = apply_replacements(rows, diffs, index, args.min_delta, args.max_jaccard)

    with args.dst.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    print(f"wrote {args.dst}")
    print(f"  replaced: {stats['replaced']}")
    print(f"  rejected (re-validation != ok): {stats['rejected_flag']}")
    print(f"  rejected (delta <= {args.min_delta}): {stats['rejected_delta']}")
    print(f"  rejected (jaccard > {args.max_jaccard}): {stats['rejected_jaccard']}")


if __name__ == "__main__":
    main()
