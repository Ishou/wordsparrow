"""Tests for the Démonette derivational-leak check."""
from __future__ import annotations
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from demonette_leak import load_leak_graph, is_derivational_leak  # noqa: E402


class StubIndex:
    """Minimal MorphologyIndex stand-in: surface -> [(lemma, frozenset())]."""
    def __init__(self, surface_to_lemmas):
        self._m = surface_to_lemmas
    def lookup_form(self, surface):
        return [(lem, frozenset()) for lem in self._m.get(surface.lower(), [])]


# filer's ≤2-hop relatives; délimiter's include the hop-2 'limite'.
GRAPH = {
    "filer": frozenset({"fil", "filet"}),
    "délimiter": frozenset({"limite"}),
}
INDEX = StubIndex({
    "fil": ["fil"], "limites": ["limite"], "transforment": ["transformer"],
    "marquera": ["marquer"], "capitaux": ["capital"],
})

def test_detects_hop1_leak():
    assert is_derivational_leak("Transforment en fil", "filer", GRAPH, INDEX) == "fil"

def test_detects_hop2_leak_via_lemmatised_token():
    # 'limites' lemmatises to 'limite', a ≤2-hop relative of délimiter.
    assert is_derivational_leak("Marquera les limites", "délimiter", GRAPH, INDEX) == "limites"

def test_no_leak_when_no_related_token():
    assert is_derivational_leak("Marquera un objet", "délimiter", GRAPH, INDEX) is None

def test_empty_graph_is_noop():
    assert is_derivational_leak("Transforment en fil", "filer", {}, INDEX) is None

def test_target_absent_from_graph_is_noop():
    assert is_derivational_leak("Injectera des capitaux", "recapitaliser", GRAPH, INDEX) is None

def test_multi_lemma_token_leaks_if_any_candidate_related():
    idx = StubIndex({"pris": ["prendre", "pris"]})
    graph = {"repriser": frozenset({"pris"})}
    assert is_derivational_leak("Ravaudé avec du pris", "repriser", graph, idx) == "pris"

def test_none_index_falls_back_to_raw_token():
    # token equals a lemma verbatim; no index available.
    assert is_derivational_leak("… fil", "filer", GRAPH, None) == "fil"

def test_load_leak_graph_roundtrip(tmp_path):
    p = tmp_path / "demonette_leak.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f); w.writerow(["answer_lemma", "related_lemma", "hop"])
        w.writerows([("filer", "fil", 1), ("filer", "filet", 2)])
    g = load_leak_graph(p)
    assert g["filer"] == frozenset({"fil", "filet"})

def test_load_leak_graph_absent_returns_empty(tmp_path):
    assert load_leak_graph(tmp_path / "nope.csv") == {}
