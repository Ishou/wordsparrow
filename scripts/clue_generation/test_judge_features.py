"""Tests for judge_features — pure assembly, no model."""

from __future__ import annotations

import numpy as np

from . import judge_features as jf


def test_style_onehot_known_style():
    styles = ["definition_directe", "metaphore", "jeu_de_mots"]
    vec = jf.style_onehot("metaphore", styles)
    assert vec.tolist() == [0.0, 1.0, 0.0]


def test_style_onehot_unknown_style_is_all_zero():
    styles = ["definition_directe", "metaphore"]
    vec = jf.style_onehot("inconnu", styles)
    assert vec.tolist() == [0.0, 0.0]


def test_feature_vector_concatenates_clue_diff_and_style():
    emb_clue = np.array([1.0, 2.0])
    emb_lemma = np.array([0.5, 0.5])
    style_vec = np.array([1.0, 0.0])
    feat = jf.feature_vector(emb_clue, emb_lemma, style_vec)
    # [clue(2), clue-lemma(2), style(2)] = 6 dims
    assert feat.tolist() == [1.0, 2.0, 0.5, 1.5, 1.0, 0.0]


def test_normalize_clue_collapses_whitespace():
    assert jf.normalize_clue("  Trancher   net ") == "Trancher net"


def test_train_probe_separates_linearly_separable_labels():
    from . import train_judge as tj
    rng = np.random.default_rng(0)
    # Two clusters, lemma-grouped so GroupKFold has ≥2 groups per fold.
    X = np.vstack([rng.normal(+2, 0.1, (10, 4)), rng.normal(-2, 0.1, (10, 4))])
    y = np.array([1] * 10 + [0] * 10)
    groups = np.array(list(range(5)) * 2 + list(range(5, 10)) * 2)
    clf, auroc = tj.train_probe(X, y, groups, C=0.05)
    assert auroc > 0.9
    assert clf.predict(X[:1]).shape == (1,)
