#!/usr/bin/env python3
"""Normalize-then-merge corpus assembler (ADR-0100).

Replaces the six in-place `words-fr.csv` mutators (`add_short_word_clues.py`,
`add_greek_and_extras.py`, `merge_editorial_into_wordlist.py`,
`merge_clues_into_wordlist.py`, `apply_clue_overrides.py`, and
`import_grammalecte_long_words.py`'s wordlist-mutation `main()`) with one
pipeline: normalize each source into the unified schema (`corpus_normalizers`),
merge by source priority, apply the curated clue-override patch, write the
CSV once.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from clue_metrics import fits_single_cell  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402
from corpus_normalizers import (  # noqa: E402
    UNIFIED_FIELDS,
    normalize_editorial,
    normalize_gold,
    normalize_grammalecte,
    normalize_surface_clues,
    normalize_unified,
)
from import_grammalecte_long_words import parse_grammalecte_lemma_anchored  # noqa: E402

# Highest priority first; "overrides" is apply_overrides's post-merge patch, not a merged source, listed here only for ordering reference.
SOURCE_PRIORITY = [
    "overrides", "curated", "themed", "gold", "editorial", "grammalecte", "llm",
]

DEFAULT_LEXIQUE = Path(os.path.expanduser(
    "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))
# Source layout relative to --data-root (repo default, or the private ADR-0097 corpus) -- see ADR-0100 for the themed-dir layout rule.
REL_WORDLIST = "grid/infrastructure/src/main/resources/words/words-fr.csv"
REL_SHORT_FR = "data/curated/short-fr.csv"
REL_FR = "data/curated/fr.csv"
REL_THEMED_DIR = "grid/infrastructure/src/main/resources/words/themed"
GOLD_GLOB = "data/curated/generation-gold-*/clues.csv"
REL_RAW_DIR = "data/curated/raw"
REL_SURFACE_CLUES = "data/eval/production/surface_clues.csv"
REL_OVERRIDES = "data/curated/clue_overrides_fr.csv"


def _sort_key(row: dict) -> tuple:
    return (row["language"], row["word"], row["pos"], row["clue"])


def merge(normalized: list[list[dict]]) -> list[dict]:
    """Concat every tier's rows, dedup by `(word.lower(), clue)` keeping the
    highest-priority source, sort by `(language, word, pos, clue)`.

    Priority is the position of each sub-list in `normalized` -- pass tiers
    in `SOURCE_PRIORITY` order (highest first); index 0 wins any dedup tie.
    A surface with two lemma-distinct rows (e.g. `lie` the verb form of
    `lier` vs `lie` the noun) carries two different clues, so both keys are
    distinct and both rows survive regardless of tier -- that's the
    forward-inflation payoff this dedup key is designed to preserve.
    """
    best: dict[tuple[str, str], tuple[int, dict]] = {}
    for rank, rows in enumerate(normalized):
        for row in rows:
            key = (row["word"].lower(), row["clue"])
            existing = best.get(key)
            if existing is None or rank < existing[0]:
                best[key] = (rank, row)
    merged = [row for _, row in best.values()]
    merged.sort(key=_sort_key)
    return merged


def load_overrides(path: Path) -> dict[str, str]:
    """word (lower-cased) -> override clue. Mirrors apply_clue_overrides.py."""
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["word"].strip().lower(): r["clue"].strip() for r in csv.DictReader(f)}


def apply_overrides(rows: list[dict], overrides: dict[str, str]) -> list[dict]:
    """Post-merge clue patch, last-writer-wins per word -- NOT a priority
    tier. Replaces `clue` in place on every row whose `word` matches an
    override, then re-sorts (the sort key includes `clue`, which this may
    have just changed) so the output stays idempotent."""
    for row in rows:
        new_clue = overrides.get(row["word"].strip().lower())
        if new_clue is not None:
            row["clue"] = new_clue
    rows.sort(key=_sort_key)
    # Overrides run post-merge with no re-dedup: a `word`-scoped override
    # rewrites every lemma-distinct row of a homograph (`lie` = lier + lie)
    # to the SAME clue, collapsing two distinct `(word, clue)` keys into
    # one duplicate that bypassed merge()'s uniqueness. Re-dedup here.
    seen: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for row in rows:
        key = (row["word"].lower(), row["clue"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def gate_grammalecte(
    surfaces: dict[str, tuple[str, int]],
    anchored_lemmas: set[str],
    covered_words: set[str],
) -> dict[str, tuple[str, int]]:
    """Filter grammalecte candidate surfaces against the higher-priority
    tiers (Findings 2+3): keep a surface only if its lemma is already
    anchored by a curated/themed/gold/editorial row AND the surface itself
    isn't already emitted by one of those tiers. Dropping covered surfaces
    stops a placeholder self-clue shadowing a real curated clue; the lemma
    anchor is the shipped `CsvWordRepository` invariant (a grammalecte
    surface ships only if its lemma already has >=1 corpus row), not a
    length band."""
    return {
        surface: (lemma, freq)
        for surface, (lemma, freq) in surfaces.items()
        if lemma.lower() in anchored_lemmas and surface.lower() not in covered_words
    }


def _read_unified_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def gate_cell_fit(rows: list[dict]) -> tuple[list[dict], int]:
    """Drop a clue too long for a grid cell WHEN the word still has a fitting
    clue; keep a word's sole clue (a long clue beats none). The surface-inflation
    tier already gates on `fits_single_cell`, but the gold/curated tiers don't —
    so hand-authored overflow clues shipped even when a shorter sibling existed.
    Empty placeholder rows never count as a fitting alternative."""
    has_fit: dict[str, bool] = {}
    for r in rows:
        clue = r["clue"]
        if clue and fits_single_cell(clue):
            has_fit[r["word"]] = True
    kept: list[dict] = []
    dropped = 0
    for r in rows:
        clue = r["clue"]
        if not clue or fits_single_cell(clue) or not has_fit.get(r["word"]):
            kept.append(r)
        else:
            dropped += 1
    return kept, dropped


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", type=Path, default=REPO,
                   help="root the source CSVs resolve against "
                        "(default: this repo; pass the private corpus repo to assemble it)")
    p.add_argument("--out", type=Path, default=None,
                   help="output words-fr.csv (default: <data-root>/" + REL_WORDLIST + ")")
    p.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    p.add_argument("--overrides", type=Path, default=None,
                   help="clue overrides CSV (default: <data-root>/" + REL_OVERRIDES + ")")
    args = p.parse_args()

    if not args.lexique.exists():
        raise SystemExit(f"grammalecte lexique not found: {args.lexique}")
    index = MorphologyIndex.load(args.lexique)

    root = args.data_root
    out_path = args.out or root / REL_WORDLIST
    overrides_path = args.overrides or root / REL_OVERRIDES
    short_fr = root / REL_SHORT_FR
    fr_csv = root / REL_FR
    themed_dir = root / REL_THEMED_DIR
    raw_dir = root / REL_RAW_DIR
    lemmas_csv = raw_dir / "_lemmas.csv"
    surface_clues_csv = root / REL_SURFACE_CLUES

    # One shared collector: every unresolved row across every tier is
    # gathered here so we can print them ALL for one human-authoring pass,
    # then fail -- rather than crashing on the first (`vue`). See Task-8.
    unresolved: list[tuple[str, str | None, str]] = []

    curated_rows = _read_unified_csv(short_fr) + _read_unified_csv(fr_csv)
    curated = normalize_unified(curated_rows, index, on_unresolved=unresolved)

    themed_rows: list[dict] = []
    if themed_dir.is_dir():
        for csv_path in sorted(themed_dir.glob("*.csv")):
            themed_rows.extend(_read_unified_csv(csv_path))
    themed = normalize_unified(themed_rows, index, on_unresolved=unresolved)

    gold: list[dict] = []
    for gold_csv in sorted(root.glob(GOLD_GLOB)):
        gold.extend(normalize_gold(gold_csv, index))

    editorial = (
        normalize_editorial(raw_dir, lemmas_csv, index,
                            on_unresolved=unresolved)
        if raw_dir.is_dir() else []
    )

    # Grammalecte is gated against the higher-priority tiers, not admitted
    # by a length band (Findings 2+3). `anchored_lemmas` is the shipped
    # lemma-anchored invariant; `covered_words` stops a placeholder
    # shadowing a real clue. The lemma-anchored parser also applies the
    # obscure-form blocklist + grid-placeability filter.
    higher_priority = [curated, themed, gold, editorial]
    anchored_lemmas = {
        (r.get("lemma") or "").lower()
        for tier in higher_priority for r in tier if r.get("lemma")
    }
    covered_words = {
        r["word"].lower() for tier in higher_priority for r in tier
    }
    grammalecte_surfaces, _ = parse_grammalecte_lemma_anchored(
        args.lexique, anchored_lemmas,
        length_min=4, length_max=15, min_freq=0,
    )
    grammalecte_surfaces = gate_grammalecte(
        grammalecte_surfaces, anchored_lemmas, covered_words,
    )
    # placeholder_clue="" so no grammalecte row ships a `clue == word`
    # self-clue; the loader drops the resulting blank-clue rows.
    grammalecte = normalize_grammalecte(grammalecte_surfaces, index, placeholder_clue="")

    llm = (
        normalize_surface_clues(surface_clues_csv)
        if surface_clues_csv.exists() else []
    )

    if unresolved:
        print(
            f"{len(unresolved)} unresolved row(s) need an authored lemma "
            f"-- nothing written. Author a lemma for each, then re-run:",
            file=sys.stderr,
        )
        for word, pos, source in sorted(unresolved):
            print(f"  {source}: {word!r}"
                  + (f" (pos={pos})" if pos else ""), file=sys.stderr)
        raise SystemExit(1)

    # Order matches SOURCE_PRIORITY[1:] ("overrides" applied separately below).
    merged = merge([curated, themed, gold, editorial, grammalecte, llm])
    merged = apply_overrides(merged, load_overrides(overrides_path))
    merged, n_overflow = gate_cell_fit(merged)
    print(f"cell-fit gate: dropped {n_overflow} overflow clues (word kept a fitting "
          f"alternative)", file=sys.stderr)
    # Defensive: never write a row with an empty surface — the loader rejects it.
    merged = [r for r in merged if (r.get("word") or "").strip()]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=UNIFIED_FIELDS, lineterminator="\n")
        w.writeheader()
        for row in merged:
            w.writerow({k: row.get(k, "") for k in UNIFIED_FIELDS})

    print(f"wrote {len(merged)} rows -> {out_path}")


if __name__ == "__main__":
    main()
