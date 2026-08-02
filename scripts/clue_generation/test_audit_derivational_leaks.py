"""Tests for the derivational-leak corpus audit."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
from audit_derivational_leaks import find_leaks  # noqa: E402


class StubIndex:
    def __init__(self, m): self._m = m
    def lookup_form(self, s): return [(l, frozenset()) for l in self._m.get(s.lower(), [])]


def test_find_leaks_reports_offenders_and_skips_placeholders():
    graph = {"filer": frozenset({"fil"})}
    index = StubIndex({"fil": ["fil"]})
    rows = [
        {"word": "FILENT", "clue": "Transforment en fil", "lemma": "filer"},
        {"word": "FILENT", "clue": "FILENT", "lemma": "filer"},   # placeholder clue==word, skip
        {"word": "MAISON", "clue": "Lieu d'habitation", "lemma": "maison"},  # clean
    ]
    leaks = find_leaks(rows, graph, index)
    assert leaks == [("FILENT", "Transforment en fil", "fil")]
