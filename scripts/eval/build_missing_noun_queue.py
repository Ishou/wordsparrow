#!/usr/bin/env python3
"""Queue nouns absent from the corpus: the placement tally filters, familiarity ranks."""
import argparse
import collections
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

# grammalecte double-tags these as `nom`; they are not nouns we want to clue.
FUNCTION_TAGS = {
    "det", "detpos", "detdem", "detind", "detneg", "detnum", "detexc", "detint",
    "pro", "propos", "prodem", "proper", "proind", "proint", "prorel",
    "prep", "cjco", "cjsub", "adv", "abr", "sigle", "interj", "num",
}
PROPER_TAGS = {"npr", "patr", "prn"}
# Slurs with no non-slur sense; a clue would have to name the insult.
BLOCKLIST_STEMS = [
    "negro", "negre", "bougnoul", "bicot", "raton", "youpin", "chintok", "niakou",
    "pede", "tapette", "tantouze", "gouine", "travelo", "rital", "polak",
    "romanichel", "manouch", "catin", "boche",
]


def fold(s):
    d = unicodedata.normalize("NFD", s.replace("œ", "oe").replace("æ", "ae"))
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


def grid_foldable(s):
    a = fold(s)
    return a.isalpha() and a.isascii()


def blocked(word):
    f = fold(word).lower()
    return any(f == s or f.startswith(s) for s in BLOCKLIST_STEMS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexique", type=Path, required=True)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--tally", type=Path, action="append", required=True,
                    help="placement-tally CSV (word,placements); repeatable")
    ap.add_argument("--min-length", type=int, default=5)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    have = {r["word"] for r in csv.DictReader(args.corpus.open(encoding="utf-8"))}

    readings = collections.defaultdict(list)
    occ = {}
    with args.lexique.open(encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            p = line.rstrip("\n").split("\t")
            if len(p) < 12:
                continue
            readings[p[2]].append((p[3], set(p[4].split())))
            try:
                occ[p[2]] = max(occ.get(p[2], 0), int(p[11]))
            except ValueError:
                pass

    candidates = []
    for surface, rs in readings.items():
        if surface in have or not surface.islower():
            continue
        if len(surface) < args.min_length or len(surface) > 15 or not grid_foldable(surface):
            continue
        if blocked(surface):
            continue
        is_noun = False
        dirty = False
        for lemma, tags in rs:
            if tags & PROPER_TAGS or tags & FUNCTION_TAGS:
                dirty = True
                break
            if any(t.startswith("v") and len(t) > 2 for t in tags):
                dirty = True
                break
            if "nom" in tags and surface == lemma and not ("pl" in tags and "sg" not in tags and "inv" not in tags):
                is_noun = True
        if is_noun and not dirty:
            candidates.append(surface)

    placed = set()
    for path in args.tally:
        for r in csv.DictReader(path.open(encoding="utf-8")):
            placed.add(r["word"])
    usable = [w for w in candidates if fold(w).upper() in placed]
    usable.sort(key=lambda w: -occ.get(w, 0))

    args.out.write_text("\n".join(usable) + "\n", encoding="utf-8")
    print(f"missing nouns (len>={args.min_length}, cleaned): {len(candidates)}")
    print(f"  of those placed by the generator: {len(usable)}")
    print(f"  written to {args.out}")
    print(f"  top 12: {', '.join(usable[:12])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
