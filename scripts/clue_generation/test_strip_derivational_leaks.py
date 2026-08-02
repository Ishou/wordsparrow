"""Tests for the derivational-leak corpus strip."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
from strip_derivational_leaks import strip_leaks  # noqa: E402


class StubIndex:
    def __init__(self, m): self._m = m
    def lookup_form(self, s): return [(l, frozenset()) for l in self._m.get(s.lower(), [])]


def test_strip_blanks_leaking_clue_to_placeholder():
    graph = {"filer": frozenset({"fil"})}
    index = StubIndex({"fil": ["fil"]})
    rows = [
        {"word": "FILENT", "clue": "Transforment en fil", "lemma": "filer"},
        {"word": "MAISON", "clue": "Lieu d'habitation", "lemma": "maison"},   # clean
        {"word": "CANARD", "clue": "CANARD", "lemma": "canard"},              # already placeholder
    ]
    n = strip_leaks(rows, graph, index)
    assert n == 1
    assert rows[0]["clue"] == "FILENT"                 # blanked to placeholder (clue == word)
    assert rows[1]["clue"] == "Lieu d'habitation"      # untouched
    assert rows[2]["clue"] == "CANARD"                 # unchanged


def test_strip_is_idempotent():
    graph = {"filer": frozenset({"fil"})}
    index = StubIndex({"fil": ["fil"]})
    rows = [{"word": "FILENT", "clue": "Transforment en fil", "lemma": "filer"}]
    assert strip_leaks(rows, graph, index) == 1
    assert strip_leaks(rows, graph, index) == 0        # nothing left on a second pass
