#!/usr/bin/env python3
"""Apply the curated clue overrides in `data/curated/clue_overrides_fr.csv` to words-fr.csv (last-writer wins)."""
from __future__ import annotations

import argparse
import csv
import io
from pathlib import Path

from import_grammalecte_long_words import DEFAULT_WORDLIST

DEFAULT_OVERRIDES = Path(__file__).resolve().parents[2] / "data" / "curated" / "clue_overrides_fr.csv"


def load_overrides(path: Path) -> dict[str, str]:
    """word (lower-cased) -> override clue."""
    with path.open(encoding="utf-8", newline="") as f:
        return {r["word"].strip().lower(): r["clue"].strip() for r in csv.DictReader(f)}


def _reserialize(fields: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(fields)
    return buf.getvalue()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--wordlist", type=Path, default=DEFAULT_WORDLIST)
    p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    overrides = load_overrides(args.overrides)
    lines = args.wordlist.read_text(encoding="utf-8").splitlines(keepends=True)
    header, body = lines[0], lines[1:]
    cols = header.rstrip("\n").split(",")
    word_idx, clue_idx = cols.index("word"), cols.index("clue")

    out, applied = [header], []
    for line in body:
        suffix = line[len(line.rstrip("\n")):]
        fields = next(csv.reader([line.rstrip("\n")]))
        new = overrides.get(fields[word_idx].strip().lower())
        if new is not None and fields[clue_idx] != new:
            applied.append((fields[word_idx], fields[clue_idx], new))
            fields[clue_idx] = new
            out.append(_reserialize(fields) + suffix)
        else:
            out.append(line)

    print(f"applied {len(applied)}/{len(overrides)} overrides")
    for w, old, new in applied:
        print(f"  {w}: {old!r} -> {new!r}")
    if not args.dry_run and applied:
        args.wordlist.write_text("".join(out), encoding="utf-8")
        print(f"wrote {args.wordlist}")


if __name__ == "__main__":
    main()
