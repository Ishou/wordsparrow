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


def _pp_homograph_index() -> MorphologyIndex:
    """satisfaire/faire: the `vous` form is a homograph of the fem-pl past participle."""
    idx = MorphologyIndex()
    _add(idx, "combler", "combler", "v1__t___zz infi")
    _add(idx, "combler", "comblez", "v1__t___zz ipre 2pl")
    _add(idx, "satisfaire", "satisfaire", "v3__t___zz infi")
    _add(idx, "satisfaire", "satisfaites", "v3__t___zz ipre 2pl")
    _add(idx, "satisfaire", "satisfaites", "v3__t___zz ppas fem pl")
    _add(idx, "pleinement", "pleinement", "adv")
    _add(idx, "actionner", "actionner", "v1__t___zz infi")
    _add(idx, "actionner", "actionnez", "v1__t___zz ipre 2pl")
    _add(idx, "faire", "faire", "v3__t___zz infi")
    _add(idx, "faire", "faites", "v3__t___zz ipre 2pl")
    _add(idx, "faire", "faites", "v3__t___zz ppas fem pl")
    _add(idx, "fonctionner", "fonctionner", "v1__t___zz infi")
    _add(idx, "mécontenter", "mécontenter", "v1__t___zz infi")
    _add(idx, "mécontenter", "mécontentez", "v1__t___zz ipre 2pl")
    _add(idx, "pas", "pas", "adv")
    return idx


def test_pp_fem_pl_homograph_head_with_adverb_is_dropped() -> None:
    """`comblez → "Satisfaites pleinement"` reads as the fem-pl adjective — routed to dropped."""
    idx = _pp_homograph_index()
    corpus = {("combler", "verbe"): [_clue("combler", "verbe", "Satisfaire pleinement")]}
    rows = build_surface_rows("comblez", corpus, idx, {})
    assert len(rows) == 1, rows
    assert rows[0]["clue"] == "Satisfaites pleinement", rows
    assert rows[0]["inflection_status"] == "pp-adjective-homograph", rows


def test_pp_fem_pl_homograph_head_with_infinitive_is_kept() -> None:
    """`actionnez → "Faites fonctionner"`: the infinitive forces the causative verb reading — kept."""
    idx = _pp_homograph_index()
    corpus = {("actionner", "verbe"): [_clue("actionner", "verbe", "Faire fonctionner")]}
    rows = build_surface_rows("actionnez", corpus, idx, {})
    assert len(rows) == 1, rows
    assert rows[0]["clue"] == "Faites fonctionner", rows
    assert rows[0]["inflection_status"] == "inflected", rows


def test_pp_fem_pl_homograph_head_under_negation_is_kept() -> None:
    """`mécontentez → "Ne satisfaites pas"`: `ne … pas` forces the verb reading — kept."""
    idx = _pp_homograph_index()
    corpus = {("mécontenter", "verbe"): [_clue("mécontenter", "verbe", "Ne satisfaire pas")]}
    rows = build_surface_rows("mécontentez", corpus, idx, {})
    assert len(rows) == 1, rows
    assert rows[0]["clue"] == "Ne satisfaites pas", rows
    assert rows[0]["inflection_status"] == "inflected", rows


def test_pp_fem_pl_homograph_head_past_leading_non_matching_content_word() -> None:
    """`comblez → "Capable de satisfaire"`: the real head (`satisfaire`) sits after
    a leading adjective (`Capable`) that isn't itself a finite verb — the scan must
    keep going past it instead of stopping at the first content token."""
    idx = _pp_homograph_index()
    _add(idx, "capable", "capable", "adj epi sg")
    corpus = {("combler", "verbe"): [_clue("combler", "verbe", "Capable de satisfaire")]}
    rows = build_surface_rows("comblez", corpus, idx, {})
    assert len(rows) == 1, rows
    assert rows[0]["clue"] == "Capable de satisfaites", rows
    assert rows[0]["inflection_status"] == "pp-adjective-homograph", rows
