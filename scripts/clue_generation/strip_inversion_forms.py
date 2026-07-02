#!/usr/bin/env python3
"""Remove literary interrogative-inversion surfaces from words-fr.csv.

Inversion forms (`posè-je`, `réprimè-je`) carry grammalecte's `Nisg` person,
which `PERSON_TOKENS` omits. They are crossword-noise (same class as passé
simple) and unclueable — the inflater skips them (`no-inflection-finite`), so
they ship either blank or, when a regeneration slips through, with an
arbitrary-person clue (`posè → Placent`). `is_obscure_tag` now
blocks them at admission; this one-off scrub removes the rows already present.

A surface is removed iff, scoped to its declared lemma, every grammalecte row
is obscure AND at least one is an inversion form — so a syncretic surface that
is also a normal conjugation (`finis` = 2sg + 1isg) is kept.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

from import_grammalecte_long_words import (  # noqa: E402
    DEFAULT_LEXIQUE,
    DEFAULT_WORDLIST,
    is_obscure_tag,
)
from morphology_index import MorphologyIndex  # noqa: E402


def is_inversion_only(word: str, lemma: str, index: MorphologyIndex) -> bool:
    rows = [
        tags for l, tags in index.lookup_form(word)
        if l.lower() == lemma.lower().strip()
    ]
    if not rows:
        return False
    labels = [is_obscure_tag(" ".join(tags)) for tags in rows]
    return all(labels) and "inversion" in labels


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    p.add_argument("--wordlist", type=Path, default=DEFAULT_WORDLIST)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.lexique.exists():
        raise SystemExit(f"grammalecte lexique not found: {args.lexique}")
    index = MorphologyIndex.load(args.lexique)

    # Filter raw lines verbatim — parse only to make the drop decision — so every
    # kept row keeps the exact bytes the Kotlin `export-words` writer produced (no
    # requoting / line-ending churn that would swamp the diff). Each row is a
    # single physical line here (no embedded newlines), so raw-line ↔ record align.
    raw = args.wordlist.read_text(encoding="utf-8").splitlines(keepends=True)
    header, body = raw[0], raw[1:]
    records = list(csv.reader(body))

    kept, dropped = [header], []
    for line, rec in zip(body, records):
        word, lemma = rec[0], rec[-1]
        if is_inversion_only(word.lower(), lemma, index):
            dropped.append(word)
        else:
            kept.append(line)

    print(f"scanned {len(body)} rows; dropping {len(dropped)} inversion forms")
    for w in dropped[:10]:
        print(f"  - {w}")
    if args.dry_run or not dropped:
        return

    args.wordlist.write_text("".join(kept), encoding="utf-8")
    print(f"wrote {len(kept) - 1} rows to {args.wordlist}")


if __name__ == "__main__":
    main()
