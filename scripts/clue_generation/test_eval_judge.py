"""Tests for eval_judge — pure metric + pair-construction logic."""

from __future__ import annotations

from . import eval_judge as ev


def test_construct_same_lemma_y_gt_n_pairs():
    rows = [
        {"lemma": "couper", "candidate": "Trancher net", "rating": "y"},
        {"lemma": "couper", "candidate": "Action de couper", "rating": "n"},
        {"lemma": "gamma", "candidate": "Rayon", "rating": "n"},
        {"lemma": "gamma", "candidate": "Lettre grecque", "rating": "y"},
    ]
    pairs = ev.construct_pairs(rows)
    # One (y, n) pair per lemma that has both.
    assert ("Trancher net", "Action de couper") in pairs
    assert ("Lettre grecque", "Rayon") in pairs
    assert len(pairs) == 2


def test_construct_skips_lemma_without_both_classes():
    rows = [
        {"lemma": "x", "candidate": "a", "rating": "y"},
        {"lemma": "x", "candidate": "b", "rating": "y"},
    ]
    assert ev.construct_pairs(rows) == []


def test_paired_accuracy_counts_correct_orderings():
    pairs = [("good1", "bad1"), ("good2", "bad2")]
    scores = {"good1": 0.9, "bad1": 0.2, "good2": 0.4, "bad2": 0.6}  # 2nd is wrong
    assert ev.paired_accuracy(pairs, scores) == 0.5


def test_auroc_perfect_ranking_is_one():
    scores = [0.1, 0.35, 0.4, 0.8]
    labels = [0, 0, 1, 1]
    assert ev.auroc(scores, labels) == 1.0
