"""Regression guard: the shipped words-fr.csv must not contain clue/answer number disagreements or diacritic-folded self-references (skips gracefully without the grammalecte lexique)."""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from build_surface_clues import _PERSON_TAGS, _head_verb_numbers, _verb_number  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402
from validate_clue import _find_lemma_family_leak  # noqa: E402

_NEW = REPO / "grid" / "infrastructure" / "src" / "main" / "resources" / "words" / "words-fr.csv"
_OLD = REPO / "grid" / "api" / "src" / "main" / "resources" / "words" / "words-fr.csv"
WORDLIST = _NEW if _NEW.exists() else _OLD

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


def _surface_number(word: str, lemma: str, index: MorphologyIndex) -> str | None:
    """Finite-verb number scoped to the row's own lemma, avoiding homograph false positives like noun `actes` vs verb `acter`."""
    target = lemma.lower().strip()
    tags: set[str] = set()
    for l, t in index.lookup_form(word.lower()):
        if l.lower() == target:
            tags |= set(t)
    if not (tags & _PERSON_TAGS):
        return None
    return _verb_number(tags)


def _rows() -> list[dict]:
    if not WORDLIST.exists():
        return []
    with WORDLIST.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_runtime_words_csv_has_no_agreement_mismatch() -> None:
    lex = _lexique()
    if lex is None:
        return  # lexique absent — nothing to guard.
    index = MorphologyIndex.load(lex)
    hits: list[tuple[str, str, str, set[str]]] = []
    for r in _rows():
        clue = (r.get("clue") or "").strip()
        if not clue:
            continue
        surf_n = _surface_number(r.get("word", ""), r.get("lemma", ""), index)
        if not surf_n:
            continue
        head_numbers = _head_verb_numbers(clue, index)
        if head_numbers and surf_n not in head_numbers:
            hits.append((r.get("word", ""), clue, surf_n, head_numbers))
    assert not hits, (
        f"words-fr.csv ships {len(hits)} clue/answer number mismatches; "
        f"first 5: {hits[:5]}"
    )


def test_runtime_words_csv_has_no_self_reference() -> None:
    lex = _lexique()
    if lex is None:
        return
    index = MorphologyIndex.load(lex)
    hits: list[tuple[str, str, str, str]] = []
    for r in _rows():
        clue = (r.get("clue") or "").strip()
        lemma = (r.get("lemma") or "").strip()
        if not clue or not lemma:
            continue
        leak = _find_lemma_family_leak(clue, lemma, index)
        if leak:
            hits.append((r.get("word", ""), lemma, clue, leak))
    assert not hits, (
        f"words-fr.csv ships {len(hits)} diacritic-folded self-references; "
        f"first 5: {hits[:5]}"
    )
