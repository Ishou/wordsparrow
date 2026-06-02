"""Tests for extract_judge_pairs — pure label-expansion + exclusion logic."""

from __future__ import annotations

from . import extract_judge_pairs as ej


HELD_OUT = {"gamma"}  # lower-cased held-out lemma


def test_pair_verdict_left_wins_labels_left_one_right_zero():
    rows = list(ej.expand_pair_rows(
        [("couper", "definition_directe", "Trancher net",
          "couper", "definition_directe", "Action de couper",
          "left_wins", "camp-1")],
        held_out=set(),
    ))
    assert {(r["clue"], r["label"]) for r in rows} == {
        ("Trancher net", 1), ("Action de couper", 0),
    }
    assert all(r["lemma"] == "couper" and r["source"] == "pair_ratings" for r in rows)


def test_pair_verdict_right_wins_labels_left_zero_right_one():
    rows = list(ej.expand_pair_rows(
        [("couper", "definition_directe", "Action de couper",
          "couper", "definition_directe", "Trancher net",
          "right_wins", "camp-1")],
        held_out=set(),
    ))
    assert {(r["clue"], r["label"]) for r in rows} == {
        ("Action de couper", 0), ("Trancher net", 1),
    }


def test_pair_verdict_both_good_labels_both_one():
    rows = list(ej.expand_pair_rows(
        [("nez", "metaphore", "Organe de l'odorat",
          "nez", "definition_directe", "Appendice facial",
          "both_good", "camp-1")],
        held_out=set(),
    ))
    assert sorted(r["label"] for r in rows) == [1, 1]


def test_pair_verdict_both_bad_labels_both_zero():
    rows = list(ej.expand_pair_rows(
        [("nez", "metaphore", "Truc", "nez", "definition_directe", "Machin",
          "both_bad", "camp-1")],
        held_out=set(),
    ))
    assert sorted(r["label"] for r in rows) == [0, 0]


def test_pair_held_out_lemma_excluded():
    rows = list(ej.expand_pair_rows(
        [("gamma", "definition_directe", "Rayon", "gamma", "metaphore", "Lettre",
          "left_wins", "camp-1")],
        held_out=HELD_OUT,
    ))
    assert rows == []
