"""Regression guard: the shipped words-fr.csv must not contain literary
interrogative-inversion surfaces (`posè-je`, `réprimè-je`, `puissé-je`).

These carry grammalecte's `Nisg` person, which `PERSON_TOKENS` omits: the
inflater can't match a person for them and skips (`no-inflection-finite`), so
they ship either unclueable or — when a regeneration slips through — with an
arbitrary-person clue (`posè → Placent`). `is_obscure_tag` now
blocks them at admission and `strip_inversion_forms.py` scrubbed the rows.

This catches the merged-but-not-rebuilt regression: a future import re-adds
inversion surfaces, or the CSV is hand-edited. Lexique-gated — it needs the
grammalecte tags to identify inversion-only surfaces, so it skips gracefully
in environments without the lexique (CI). The admission unit test
(`test_import_grammalecte_admission.py`) and the inflater exact-or-skip test
(`test_inflect_clue.py`) run everywhere and are the CI-visible guards.

If this fires, re-run:
    python scripts/clue_generation/strip_inversion_forms.py
"""
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
