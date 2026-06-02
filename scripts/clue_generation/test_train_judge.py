"""Tests for train_judge — held-out hygiene, style conditioning, matrix assembly (no real model)."""

from __future__ import annotations

import numpy as np

from . import train_judge as tj


class _FakeEmbedder:
    """Deterministic stand-in for SentenceTransformer; one 3-d vector per distinct text."""

    def __init__(self):
        self._vocab: dict[str, int] = {}

    def encode(self, texts, show_progress_bar=False):
        out = []
        for t in texts:
            idx = self._vocab.setdefault(t, len(self._vocab))
            out.append([float(idx), float(idx % 3), float((idx + 1) % 2)])
        return np.asarray(out)


def test_exclude_held_out_drops_reserved_lemmas():
    records = [
        {"lemma": "abime", "clue": "a", "style": "s", "label": 1},
        {"lemma": "zenith", "clue": "b", "style": "s", "label": 0},
    ]
    kept = tj.exclude_held_out(records, {"zenith"})
    assert [r["lemma"] for r in kept] == ["abime"]


def test_build_matrix_includes_style_dimensions():
    records = [
        {"lemma": "abime", "clue": "Gouffre", "style": "definition_directe", "label": 1},
        {"lemma": "zenith", "clue": "Au plus haut", "style": "metaphore", "label": 0},
    ]
    styles = ["definition_directe", "metaphore"]
    X, y, groups = tj._build_matrix(_FakeEmbedder(), records, styles)
    # 3 (emb) + 3 (emb diff) + 2 (style) = 8 columns; style block is the last len(styles).
    assert X.shape == (2, 8)
    style_block = X[:, -len(styles):]
    assert style_block[0].tolist() == [1.0, 0.0]
    assert style_block[1].tolist() == [0.0, 1.0]
    assert y.tolist() == [1, 0]
    assert len(set(groups.tolist())) == 2


def test_backbones_compares_base_and_v5_without_hardcoding():
    assert set(tj.BACKBONES) == {"camembert-base", "filter-camembert-v5"}
    assert tj.BACKBONES["filter-camembert-v5"] == "models/filter-camembert-v5"
