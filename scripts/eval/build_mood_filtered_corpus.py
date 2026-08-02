#!/usr/bin/env python3
"""Drop corpus surfaces whose every grammalecte reading is an unwanted verb mood."""

import argparse
import collections
import csv
import shutil
import sys
from pathlib import Path

SUBJ = {"spre", "simp"}
THIRD = {"3sg", "3pl", "3pl!", "3isg"}
# A reading carrying none of these is not a finite verb form, so it always saves the surface.
MOODS = {"ipre", "iimp", "ipsi", "ifut", "cond", "impe", "spre", "simp", "infi", "ppas", "ppre"}


def load_lexique(path: Path) -> dict[str, list[set[str]]]:
    readings: dict[str, list[set[str]]] = collections.defaultdict(list)
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            readings[parts[2]].append(set(parts[4].split()))
    return readings


def readings_for(surface: str, lexique: dict[str, list[set[str]]]) -> list[set[str]]:
    return lexique.get(surface) or lexique.get(surface.lower()) or []


def is_subjunctive_only(readings: list[set[str]]) -> bool:
    if not readings:
        return False
    return all(tags & SUBJ and not (tags & (MOODS - SUBJ)) for tags in readings)


def is_passe_simple_nonthird(readings: list[set[str]]) -> bool:
    if not readings:
        return False
    if not all("ipsi" in tags and not (tags & (MOODS - {"ipsi"})) for tags in readings):
        return False
    return not any(tags & THIRD for tags in readings)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexique", type=Path, required=True)
    ap.add_argument("--corpus-in", type=Path, required=True, help="dir containing words/words-fr.csv")
    ap.add_argument("--corpus-out", type=Path, required=True)
    ap.add_argument("--drop-subjunctive", action="store_true")
    ap.add_argument("--drop-ps-nonthird", action="store_true")
    args = ap.parse_args()

    lexique = load_lexique(args.lexique)

    src_words = args.corpus_in / "words"
    out_words = args.corpus_out / "words"
    if args.corpus_out.exists():
        shutil.rmtree(args.corpus_out)
    shutil.copytree(src_words, out_words)

    main_csv = out_words / "words-fr.csv"
    with main_csv.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames
        rows = list(reader)

    kept, dropped = [], collections.Counter()
    dropped_surfaces: dict[str, set[str]] = {"subjunctive": set(), "ps-nonthird": set()}
    for row in rows:
        readings = readings_for(row["word"], lexique)
        if args.drop_subjunctive and is_subjunctive_only(readings):
            dropped["subjunctive"] += 1
            dropped_surfaces["subjunctive"].add(row["word"])
            continue
        if args.drop_ps_nonthird and is_passe_simple_nonthird(readings):
            dropped["ps-nonthird"] += 1
            dropped_surfaces["ps-nonthird"].add(row["word"])
            continue
        kept.append(row)

    with main_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(kept)

    print(f"rows in={len(rows)} kept={len(kept)}")
    for reason, count in dropped.most_common():
        print(f"  dropped {reason}: {count} rows / {len(dropped_surfaces[reason])} surfaces")
    print(f"corpus written to {args.corpus_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
