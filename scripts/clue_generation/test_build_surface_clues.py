"""Locks in the multi-clue fallback: the first fitting gold clue wins, tried last-first."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_surface_clues import build_surface_rows  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402


def _add(idx: MorphologyIndex, lemma: str, surface: str, tags: str) -> None:
    ts = frozenset(tags.split())
    idx.by_lemma.setdefault(lemma, []).append((surface, ts))
    idx.by_form.setdefault(surface, []).append((lemma, ts))


def _clue(lemma: str, pos: str, text: str) -> dict:
    return {"lemma": lemma, "pos": pos, "lemma_clue": text,
            "filter_score": "1.0", "validation_flag": "ok"}


def _index() -> MorphologyIndex:
    idx = MorphologyIndex()
    _add(idx, "esse", "esse", "nom fem sg")
    _add(idx, "esse", "esses", "nom fem pl")
    _add(idx, "crochet", "crochet", "nom mas sg")
    _add(idx, "crochet", "crochets", "nom mas pl")
    _add(idx, "suffixe", "suffixe", "nom mas sg")
    _add(idx, "suffixe", "suffixes", "nom mas pl")
    return idx


def test_falls_back_to_fitting_clue_when_primary_too_long() -> None:
    idx = _index()
    # Last clue (the pre-fix "primary") is 28 chars → too long for a cell;
    # the earlier one fits and inflects cleanly.
    corpus = {("esse", "nom"): [
        _clue("esse", "nom", "Crochet en forme de S"),
        _clue("esse", "nom", "Suffixe formant des féminins"),
    ]}
    rows = build_surface_rows("esses", corpus, idx, {})
    clues = [r["clue"] for r in rows]
    assert "Crochets en forme de S" in clues, clues
    assert all("uffixes formant" not in c for c in clues), clues


def test_primary_clue_still_wins_when_it_fits() -> None:
    """No regression: the primary clue still wins when it fits the cell."""
    idx = _index()
    corpus = {("esse", "nom"): [
        _clue("esse", "nom", "Crochet en forme de S"),
        _clue("esse", "nom", "Crochet de boucher"),
    ]}
    rows = build_surface_rows("esses", corpus, idx, {})
    assert [r["clue"] for r in rows] == ["Crochets de boucher"], rows
