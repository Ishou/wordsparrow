#!/usr/bin/env python3
"""Reconstruct historical rejected clues into GOOD/BAD training pairs.

`run_production.sh` overwrites `lemma_clues_dropped.csv` every run, so past
generations' rejects survive only as git snapshots of that file plus the
committed human-rated `lemma_clues_iter*.csv` (`rating=n`). This harvests both,
then:

  1. dedupes by (lemma, pos, clue);
  2. re-validates each against TODAY's guard, keeping only rows that STILL fail
     (a guard fix should retire its old rejects, not keep punishing them);
  3. keeps only clean BAD classes — `unknown-head`/`no-head` (truncated /
     hallucinated fragments, unambiguously bad) and single-token
     `pos-mismatch`/`self-reference`. Drops `too-long` and `head-not-lemma`,
     whose rejects are usually good clues (length / inflected form), and
     multi-token `pos-mismatch` (relative-clause false positives like
     "Qui ne change pas");
  4. pairs each with the latest generation's clue for that lemma, but only when
     that clue itself validates `ok` and clears a filter-score floor — so the
     GOOD side isn't a fresh wrong-sense clue (`abêtissement -> "Déboisement"`).

Output `data/lora_filter/historical_reject_pairs.csv` feeds `train_filter_v6.py`.
"""
from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "eval"))
from morphology_index import MorphologyIndex  # noqa: E402
from validate_clue import validate_lemma_clue  # noqa: E402

DROPPED = "data/eval/production/lemma_clues_dropped.csv"
LATEST = REPO / "data" / "eval" / "production" / "lemma_clues_raw.csv"
OUT = REPO / "data" / "lora_filter" / "historical_reject_pairs.csv"
CLEAN_ALWAYS = {"unknown-head", "no-head"}
CLEAN_IF_SINGLE_TOKEN = {"pos-mismatch", "self-reference"}


def _git_snapshot_rows(ref: str) -> list[dict]:
    try:
        out = subprocess.run(["git", "show", f"{ref}:{DROPPED}"], cwd=REPO,
                             capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return []
    return list(csv.DictReader(io.StringIO(out)))


def is_clean_bad(flag: str, clue: str) -> bool:
    if flag in CLEAN_ALWAYS:
        return True
    return flag in CLEAN_IF_SINGLE_TOKEN and " " not in clue.strip()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--lexique", type=Path, default=Path(
        "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt").expanduser())
    p.add_argument("--min-good-score", type=float, default=0.5)
    args = p.parse_args()
    index = MorphologyIndex.load(args.lexique)

    # 1. Harvest guard-rejected rows from every dropped.csv snapshot + human n.
    refs = subprocess.run(["git", "log", "--all", "--format=%H", "--", DROPPED],
                          cwd=REPO, capture_output=True, text=True).stdout.split()
    harvest: dict[tuple[str, str, str], str] = {}
    for ref in refs:
        for r in _git_snapshot_rows(ref):
            lemma = (r.get("lemma") or "").strip().lower()
            pos = (r.get("pos") or "").strip()
            clue = (r.get("lemma_clue") or "").strip()
            if lemma and clue and (r.get("validation_flag") or "").strip() != "ok":
                harvest.setdefault((lemma, pos, clue), r.get("validation_flag", ""))
    for path in sorted((REPO / "data" / "eval").glob("lemma_clues_iter*.csv")):
        for r in csv.DictReader(path.open(encoding="utf-8")):
            if (r.get("rating") or "").strip().lower() != "n":
                continue
            lemma = (r.get("lemma") or "").strip().lower()
            clue = (r.get("lemma_clue") or "").strip()
            if lemma and clue:
                harvest.setdefault((lemma, (r.get("pos") or "").strip(), clue), "human-n")

    # 2. Latest-generation good clue per lemma (validated + score-gated).
    latest: dict[str, tuple[str, str, float]] = {}
    for r in csv.DictReader(LATEST.open(encoding="utf-8")):
        lemma = (r.get("lemma") or "").strip().lower()
        clue = (r.get("lemma_clue") or "").strip()
        try:
            score = float(r.get("filter_score") or 0)
        except ValueError:
            score = 0.0
        if lemma and clue:
            latest[lemma] = (clue, (r.get("pos") or "").strip(), score)

    pairs, kept, still = [], 0, 0
    for (lemma, pos, bad), flag in harvest.items():
        if not pos:
            continue
        today = validate_lemma_clue(bad, lemma, pos, index).flag
        if today == "ok":
            continue
        still += 1
        if not is_clean_bad(today, bad):
            continue
        good = latest.get(lemma)
        if not good:
            continue
        good_clue, good_pos, good_score = good
        if (good_clue.strip().lower() == bad.strip().lower()
                or good_score < args.min_good_score
                or validate_lemma_clue(good_clue, lemma, good_pos or pos, index).flag != "ok"):
            continue
        pairs.append({"lemma": lemma, "pos": good_pos or pos,
                      "good": good_clue, "bad": bad, "bad_flag": today})
        kept += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["lemma", "pos", "good", "bad", "bad_flag"],
                           lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(pairs, key=lambda r: (r["lemma"], r["bad"])))
    print(f"harvested rejects: {len(harvest)}  still-guard-failed: {still}")
    print(f"clean GOOD/BAD pairs written: {kept} -> {OUT}")


if __name__ == "__main__":
    main()
