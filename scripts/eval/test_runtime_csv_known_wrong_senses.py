"""Regression guard: the shipped words-fr.csv must carry the curated override clue for every known-wrong-sense word in `data/curated/clue_overrides_fr.csv`."""
from __future__ import annotations

import csv
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
_NEW = REPO / "grid" / "infrastructure" / "src" / "main" / "resources" / "words" / "words-fr.csv"
_OLD = REPO / "grid" / "api" / "src" / "main" / "resources" / "words" / "words-fr.csv"
WORDLIST = _NEW if _NEW.exists() else _OLD
OVERRIDES = REPO / "data" / "curated" / "clue_overrides_fr.csv"


def test_runtime_csv_honours_curated_overrides() -> None:
    if not WORDLIST.exists() or not OVERRIDES.exists():
        return
    with OVERRIDES.open(encoding="utf-8", newline="") as f:
        want = {r["word"].strip().lower(): r["clue"].strip() for r in csv.DictReader(f)}
    with WORDLIST.open(encoding="utf-8", newline="") as f:
        shipped = {r["word"].strip().lower(): (r.get("clue") or "").strip()
                   for r in csv.DictReader(f)}
    violations = [
        (w, shipped.get(w), clue)
        for w, clue in want.items()
        if w in shipped and shipped.get(w) != clue
    ]
    assert not violations, (
        f"{len(violations)} curated overrides not honoured in words-fr.csv "
        f"(word, shipped, expected): {violations[:5]}. "
        f"Run scripts/clue_generation/apply_clue_overrides.py."
    )
