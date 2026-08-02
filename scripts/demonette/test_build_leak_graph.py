"""Tests for the Démonette ≤2-hop leak-graph builder."""
from __future__ import annotations
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_leak_graph import build_adjacency, neighbours, build_leak_rows  # noqa: E402

# graph_1, graph_2, complexite are the only columns the builder reads (tab-separated).
REL_HEADER = ["graph_1", "graph_2", "complexite"]
REL_ROWS = [
    ["filer", "fil", "simple"],           # kept
    ["fil", "filet", "simple"],           # kept -> fil is a 2-hop bridge filer..filet
    ["école", "scolaire", "motiv-sem"],   # dropped (suppletive)
    ["laver", "école", "accidentel"],     # dropped (false friend)
    ["capitaliser", "capital", "simple"], # kept, capital out of corpus (leak side may be non-corpus)
]

def _write_rel(tmp_path):
    p = tmp_path / "relations.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(REL_HEADER)
        w.writerows(REL_ROWS)
    return p

def test_adjacency_excludes_motivsem_and_accidentel(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    assert adj["filer"] == {"fil"}
    assert adj["fil"] == {"filer", "filet"}
    assert "école" not in adj          # both its edges were dropped
    assert "scolaire" not in adj

def test_neighbours_two_hops(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    nb = neighbours(adj, "filer", max_hop=2)
    assert nb == {"fil": 1, "filet": 2}   # src excluded, filet reached at hop 2

def test_leak_rows_corpus_scoped_answers_relatives_may_be_noncorpus(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    corpus = {"filer", "capitaliser"}     # answers; 'capital' NOT in corpus
    rows = build_leak_rows(adj, corpus, max_hop=2)
    assert ("filer", "fil", 1) in rows
    assert ("filer", "filet", 2) in rows
    assert ("capitaliser", "capital", 1) in rows   # relative is out-of-corpus, still kept
    assert all(r[0] in corpus for r in rows)        # answers restricted to corpus
    assert rows == sorted(rows)                      # deterministic order
