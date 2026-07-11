#!/usr/bin/env python3
"""Build the inflator's lemma-clue corpus from the gold (Claude-authored,
qualified) clue sets — NOT the LoRA `raw_pos` output.

The clue source of record is `data/curated/generation-gold-*/clues.csv`
(hand/Claude-authored, gold-tier). This step converts those into the
`(lemma, pos, lemma_clue, validation_flag, filter_score)` shape that
`build_surface_clues.py` consumes, so gold clues get forward-inflated onto
every surface of their paradigm. Gold is trusted, so every row ships
`validation_flag=ok` and `filter_score=1.0`.

Schema tolerance across the gold files:
- `lemma,clue,pos,source`  (gold-2000 / tier2 / tier3) — the inflatable rows.
- `lemma,clue,source`      (compounds) — no POS, skipped (not inflatable here).
- `surface,clue`           (manual)   — no POS, skipped.

A row needs a non-empty lemma, POS and clue to be inflatable; the rest still
reach the corpus as direct entries via `normalize_gold` in the assembler.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

CORPUS_FIELDS = [
    "lemma", "pos", "definition", "synonyms", "lemma_clue",
    "attempts", "validation_flag", "rating", "filter_score",
]


def gold_rows(gold_glob_root: Path):
    """Yield inflatable corpus rows from every gold clues.csv under the root."""
    for path in sorted(gold_glob_root.glob("data/curated/generation-gold-*/clues.csv")):
        with path.open(encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                lemma = (r.get("lemma") or r.get("surface") or "").strip()
                pos = (r.get("pos") or "").strip()
                clue = (r.get("clue") or "").strip()
                if not (lemma and pos and clue):
                    continue
                yield {
                    "lemma": lemma, "pos": pos, "definition": "", "synonyms": "",
                    "lemma_clue": clue, "attempts": "1", "validation_flag": "ok",
                    "rating": "", "filter_score": "1.0",
                }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data-root", type=Path, default=REPO,
                   help="root the gold files resolve against (default: this repo)")
    p.add_argument("--out", type=Path, default=None,
                   help="output corpus (default: <data-root>/data/eval/production/lemma_clues_gold.csv)")
    args = p.parse_args()

    out = args.out or args.data_root / "data/eval/production/lemma_clues_gold.csv"
    rows = list(gold_rows(args.data_root))
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CORPUS_FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    distinct = len({(r["lemma"].lower(), r["pos"]) for r in rows})
    print(f"wrote {len(rows)} rows ({distinct} distinct (lemma,pos)) -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
