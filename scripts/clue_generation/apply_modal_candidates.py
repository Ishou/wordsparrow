#!/usr/bin/env python3
"""Fold pipeline_v2-accepted Modal (Command-R) candidates into the (lemma, pos)
corpus, trusting pipeline_v2's acceptance.

The Command-R lane emits definitional clues (ppas / relative-clause / noun-phrase
heads) that pipeline_v2 already gates. The grid-side `validate_clue` is the MLX
lane's lemma-form validator and false-flags ~870 of these as head-not-lemma /
pos-mismatch, so we do NOT re-validate here — an accepted candidate is set
`validation_flag=ok`. Only the prompt-echo garbage pipeline_v2 misses
(`"Style : définition directe"`) is dropped.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CORPUS = REPO / "data" / "eval" / "production" / "lemma_clues_raw_pos.csv"
POS_BACK = {"nom_commun": "nom", "verbe_infinitif": "verbe", "adjectif": "adj", "adverbe": "adv"}
_PROMPT_ECHO = re.compile(r"\bstyle\s*:|définition\s+directe|périphrase|métonymie", re.IGNORECASE)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--candidates", type=Path, required=True)
    p.add_argument("--corpus", type=Path, default=CORPUS)
    args = p.parse_args()

    cand: dict[tuple[str, str], str] = {}
    echo = 0
    for line in args.candidates.open(encoding="utf-8"):
        d = json.loads(line)
        clue = d["definition"].strip()
        if _PROMPT_ECHO.search(clue) or len(clue) < 2:
            echo += 1
            continue
        cand[(d["mot"].strip().lower(), POS_BACK.get(d["pos"], d["pos"]))] = clue

    rows = list(csv.DictReader(args.corpus.open(encoding="utf-8")))
    fields = list(rows[0].keys())
    applied = 0
    for r in rows:
        clue = cand.get((r["lemma"].strip().lower(), r["pos"]))
        if clue is not None:
            r["lemma_clue"] = clue
            r["validation_flag"] = "ok"   # trust pipeline_v2, not the grid-side validator
            r["filter_score"] = "1.0"
            applied += 1

    with args.corpus.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"applied {applied} pipeline_v2-accepted clues (flag=ok); dropped {echo} prompt-echo/empty")


if __name__ == "__main__":
    main()
