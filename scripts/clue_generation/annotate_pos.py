#!/usr/bin/env python3
"""Explode the lemma-clues raw CSV into one row per (lemma, POS the lemma genuinely has), re-deriving `validation_flag` per row."""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "eval"))
from morphology_index import MorphologyIndex, _classify  # noqa: E402
from validate_clue import validate_lemma_clue  # noqa: E402

POS_PRECEDENCE = {"nom": 0, "adj": 1, "adv": 2, "verbe": 3}


def lemma_own_pos_classes(lemma: str, index: MorphologyIndex) -> set[str]:
    """The content-POS classes for which `lemma` is itself a citation form (excludes cross-lemma POS a homograph surface would otherwise contribute)."""
    return {
        c
        for _surface, tags in index.by_lemma.get(lemma.lower(), [])
        if (c := _classify(tags)) in POS_PRECEDENCE
    }


def expand_and_validate(
    rows: list[dict], index: MorphologyIndex,
    blocklist: frozenset[str] | None = None,
) -> list[dict]:
    """One output row per (lemma, own-POS), with `validation_flag` recomputed for the clue against that POS; lemmas grammalecte can't resolve keep a single pos-less row."""
    out: list[dict] = []
    for r in rows:
        lemma = r["lemma"]
        clue = (r.get("lemma_clue") or "").strip()
        classes = sorted(lemma_own_pos_classes(lemma, index), key=lambda c: POS_PRECEDENCE[c])
        if not classes:
            out.append({**r, "pos": ""})
            continue
        for pos in classes:
            row = {**r, "pos": pos}
            if clue:
                row["validation_flag"] = validate_lemma_clue(clue, lemma, pos, index, blocklist).flag
            out.append(row)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path,
                   default=REPO / "data" / "eval" / "production" / "lemma_clues_raw.csv")
    p.add_argument("--dst", type=Path,
                   default=REPO / "data" / "eval" / "production" / "lemma_clues_raw_pos.csv")
    p.add_argument("--lexique", type=Path,
                   default=Path(os.path.expanduser(
                       "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt")))
    args = p.parse_args()

    print("loading morphology index...", file=sys.stderr)
    index = MorphologyIndex.load(args.lexique)

    with args.src.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())
    if "pos" not in fieldnames:
        fieldnames.insert(1, "pos")
    print(f"loaded {len(rows)} lemmas", file=sys.stderr)

    out = expand_and_validate(rows, index)

    by_pos: dict[str, int] = defaultdict(int)
    for r in out:
        by_pos[r["pos"] or "(unresolved)"] += 1

    with args.dst.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in out:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    print(f"\nwrote {args.dst}: {len(rows)} lemmas -> {len(out)} (lemma, pos) rows")
    print(f"  POS distribution: {dict(by_pos)}")


if __name__ == "__main__":
    main()
