"""Pure feature helpers for the clue judge (shared by trainer + eval; no model)."""

from __future__ import annotations

import numpy as np


def normalize_clue(s: str) -> str:
    """Strip and collapse internal whitespace."""
    return " ".join(s.split())


def style_onehot(style: str, styles: list[str]) -> np.ndarray:
    """One-hot a style against a fixed ordered vocabulary; unknown → all-zero."""
    vec = np.zeros(len(styles), dtype=float)
    if style in styles:
        vec[styles.index(style)] = 1.0
    return vec


def feature_vector(emb_clue: np.ndarray, emb_lemma: np.ndarray, style_vec: np.ndarray) -> np.ndarray:
    """Spike recipe + style: [emb(clue), emb(clue) − emb(lemma), style_onehot]."""
    return np.concatenate([emb_clue, emb_clue - emb_lemma, style_vec])
