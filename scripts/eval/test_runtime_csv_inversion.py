"""Regression guard: shipped words-fr.csv must carry no literary interrogative-inversion surfaces. Lexique-gated (skips without it). If it fires, re-run `python scripts/clue_generation/strip_inversion_forms.py`."""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from import_grammalecte_long_words import is_obscure_tag  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

_NEW = REPO / "grid" / "infrastructure" / "src" / "main" / "resources" / "words" / "words-fr.csv"
_OLD = REPO / "grid" / "api" / "src" / "main" / "resources" / "words" / "words-fr.csv"
WORDLIST = _NEW if _NEW.exists() else _OLD

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


def _is_inversion_only(word: str, lemma: str, index: MorphologyIndex) -> bool:
    rows = [t for l, t in index.lookup_form(word) if l.lower() == lemma.lower().strip()]
    if not rows:
        return False
    labels = [is_obscure_tag(" ".join(t)) for t in rows]
    return all(labels) and "inversion" in labels


def test_runtime_words_csv_has_no_inversion_forms() -> None:
    lex = _lexique()
    if lex is None or not WORDLIST.exists():
        return  # lexique or wordlist absent — nothing to guard.
    index = MorphologyIndex.load(lex)
    with WORDLIST.open(encoding="utf-8", newline="") as f:
        hits = [
            r["word"] for r in csv.DictReader(f)
            if _is_inversion_only(r.get("word", "").lower(), r.get("lemma", ""), index)
        ]
    assert not hits, (
        f"words-fr.csv ships {len(hits)} inversion forms; first 5: {hits[:5]}. "
        f"Run scripts/clue_generation/strip_inversion_forms.py."
    )
