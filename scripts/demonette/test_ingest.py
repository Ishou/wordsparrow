"""Tests for the Démonette-2 ingest: filtering, corpus restriction, and family grouping."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from ingest import (  # noqa: E402
    build_families,
    build_lid_lemma_map,
    build_relations,
    load_corpus_lemmas,
)

RELATIONS_COLS = [
    "lid_1", "graph_1", "lid_2", "graph_2",
    "cat_1", "cat_2", "cstr_1", "cstr_2", "complexite", "orientation",
]

# Directed rows (both orientations, one duplicate, one false friend, one out-of-corpus).
RELATIONS_ROWS = [
    ["l1", "laver", "l2", "lavage", "V", "Nm", "X", "Xage", "simple", "as2des"],
    ["l2", "lavage", "l1", "laver", "Nm", "V", "Xage", "X", "simple", "des2as"],
    ["l1", "laver", "l2", "lavage", "V", "Nm", "X", "Xage", "simple", "as2des"],  # exact dup
    ["l4", "école", "l5", "scolaire", "Nf", "Adj", "X", "X", "motiv-sem ", "as2des"],  # trailing ws
    ["l1", "laver", "l4", "école", "V", "Nf", "X", "X", "accidentel", "NA"],  # false friend
    ["l1", "laver", "l9", "inconnu", "V", "Nm", "X", "Xeur", "simple", "as2des"],  # out of corpus
]

# fid -> lids; f3 is a size-1 corpus family, f4's only resolvable member is out-of-corpus.
FAMILIES_ROWS = [
    ["f1", "l1;l2"],
    ["f2", "l4;l5"],
    ["f3", "l1"],
    ["f4", "l2;l9"],
]

CORPUS_LEMMAS = ["laver", "lavage", "école", "scolaire"]


def _write_tsv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(header)
        w.writerows(rows)


def _write_corpus(path: Path, lemmas: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["word", "lemma"])
        for lemma in lemmas:
            w.writerow([lemma, lemma])


def _fixtures(tmp_path: Path):
    rel = tmp_path / "relations.csv"
    fam = tmp_path / "families.csv"
    corpus_path = tmp_path / "words-fr.csv"
    _write_tsv(rel, RELATIONS_COLS, RELATIONS_ROWS)
    _write_tsv(fam, ["fid", "lids"], FAMILIES_ROWS)
    _write_corpus(corpus_path, CORPUS_LEMMAS)
    corpus = load_corpus_lemmas(corpus_path)
    return rel, fam, corpus


def test_corpus_lemmas_loaded(tmp_path: Path) -> None:
    _, _, corpus = _fixtures(tmp_path)
    assert corpus == set(CORPUS_LEMMAS)


def test_accidentel_dropped(tmp_path: Path) -> None:
    rel, _, corpus = _fixtures(tmp_path)
    edges, stats = build_relations(rel, corpus)
    assert stats.dropped_accidentel == 1
    assert not any(e[7] == "accidentel" for e in edges)
    # the false-friend laver/école pair must not survive
    assert not any({e[0], e[3]} == {"laver", "école"} for e in edges)


def test_motiv_sem_kept_and_complexite_stripped(tmp_path: Path) -> None:
    rel, _, corpus = _fixtures(tmp_path)
    edges, _ = build_relations(rel, corpus)
    ecole_edge = next(e for e in edges if e[0] == "école" and e[3] == "scolaire")
    assert ecole_edge[7] == "motiv-sem"  # trailing whitespace stripped, relation kept


def test_suffixation_pair_survives_with_pos_and_affix(tmp_path: Path) -> None:
    rel, _, corpus = _fixtures(tmp_path)
    edges, _ = build_relations(rel, corpus)
    edge = next(e for e in edges if e[0] == "laver" and e[3] == "lavage")
    assert edge == ("laver", "V", "X", "lavage", "Nm", "Xage", "as2des", "simple")


def test_out_of_corpus_relation_dropped(tmp_path: Path) -> None:
    rel, _, corpus = _fixtures(tmp_path)
    edges, stats = build_relations(rel, corpus)
    assert stats.dropped_out_of_corpus == 1
    assert not any("inconnu" in (e[0], e[3]) for e in edges)


def test_exact_duplicate_edges_deduped(tmp_path: Path) -> None:
    rel, _, corpus = _fixtures(tmp_path)
    edges, stats = build_relations(rel, corpus)
    forward = [e for e in edges if e[0] == "laver" and e[3] == "lavage"]
    assert len(forward) == 1  # the duplicated source row collapses
    assert stats.kept_edges == len(edges)


def test_family_grouping_and_size(tmp_path: Path) -> None:
    rel, fam, corpus = _fixtures(tmp_path)
    lid_lemma = build_lid_lemma_map(rel)
    rows, stats = build_families(fam, corpus, lid_lemma)
    assert set(rows) == {
        ("laver", "f1", 2),
        ("lavage", "f1", 2),
        ("école", "f2", 2),
        ("scolaire", "f2", 2),
    }
    # f3 (size-1 corpus family) and f4 (only out-of-corpus resolvable member) are excluded
    assert stats.emitted_families == 2
    assert not any(r[1] in {"f3", "f4"} for r in rows)


def test_lid_lemma_map_from_relations(tmp_path: Path) -> None:
    rel, _, _ = _fixtures(tmp_path)
    lid_lemma = build_lid_lemma_map(rel)
    assert lid_lemma["l1"] == "laver"
    assert lid_lemma["l9"] == "inconnu"
