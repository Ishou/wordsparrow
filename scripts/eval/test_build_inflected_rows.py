"""Tests for `build_inflected_rows.inflection_is_safe`, the independent re-verification of an inflected clue."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_inflected_rows import grid_foldable, inflection_is_safe  # noqa: E402
from inflect_clue import InflectionResult  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402


def _add(idx: MorphologyIndex, lemma: str, surface: str, tags: str) -> None:
    ts = frozenset(tags.split())
    idx.by_lemma.setdefault(lemma, []).append((surface, ts))
    idx.by_form.setdefault(surface, []).append((lemma, ts))


def _noun_index() -> MorphologyIndex:
    idx = MorphologyIndex()
    _add(idx, "tonneau", "tonneau", "nom mas sg")
    _add(idx, "tonneau", "tonneaux", "nom mas pl")
    _add(idx, "même", "même", "adj epi sg")
    _add(idx, "même", "mêmes", "adj epi pl")
    _add(idx, "culte", "culte", "nom mas sg")
    _add(idx, "culte", "cultes", "nom mas pl")
    return idx


def test_rejects_a_flagged_inflection() -> None:
    res = InflectionResult("Du même tonneau", "no-head")
    ok, reason = inflection_is_safe("Du même tonneau", res, {"nom", "mas", "pl"}, _noun_index())
    assert not ok
    assert "no-head" in reason


def test_rejects_when_the_head_did_not_move() -> None:
    res = InflectionResult("Du même tonneau", "")
    ok, reason = inflection_is_safe("Du même tonneau", res, {"nom", "mas", "pl"}, _noun_index())
    assert not ok
    assert reason == "head did not inflect"


def test_rejects_a_plural_behind_a_singular_only_determiner() -> None:
    """`Du cultes` is ungrammatical: `du` cannot govern a plural, so the row is dropped rather than shipped."""
    res = InflectionResult("Fervent du cultes", "")
    ok, reason = inflection_is_safe(
        "Fervent du culte", res, {"nom", "mas", "pl"}, _noun_index()
    )
    assert not ok
    assert reason == "plural behind singular determiner"


def test_rejects_when_the_target_number_is_absent() -> None:
    res = InflectionResult("Du mêmes tonneau", "")
    ok, reason = inflection_is_safe(
        "Du même tonneau", res, {"nom", "mas", "sg"}, _noun_index()
    )
    assert not ok
    assert reason == "target number absent"


def test_rejects_a_token_count_change() -> None:
    res = InflectionResult("Du même tonneau bis", "")
    ok, reason = inflection_is_safe("Du même tonneau", res, {"nom", "mas", "pl"}, _noun_index())
    assert not ok
    assert reason == "token count changed"


def test_rejects_a_finite_verb_left_unagreed() -> None:
    """A plural target that inflects the object but leaves `contient` singular is dropped."""
    idx = _noun_index()
    _add(idx, "contenir", "contient", "v3__t___zz ipre 3sg")
    res = InflectionResult("Contient des tonneaux", "")
    ok, reason = inflection_is_safe(
        "Contient des tonneau", res, {"nom", "mas", "pl"}, idx
    )
    assert not ok
    assert reason == "finite verb left unagreed"


def test_accepts_a_clean_plural_inflection() -> None:
    idx = _noun_index()
    res = InflectionResult("Des mêmes tonneaux", "")
    ok, reason = inflection_is_safe(
        "Des mêmes tonneau", res, {"nom", "mas", "pl"}, idx
    )
    assert ok, reason


def test_grid_foldable_rejects_non_ascii_foldable_surfaces() -> None:
    assert grid_foldable("créé")
    assert grid_foldable("cœur")
    assert not grid_foldable("côte-d'or")


def test_rejects_a_conjugated_compound_element() -> None:
    """`couvre-chef` is a compound noun; agreeing its first element yields `Couvrent-chef`, so the row is dropped."""
    idx = _noun_index()
    _add(idx, "couvrir", "couvre", "v3__t___zz ipre 3sg")
    _add(idx, "couvrir", "couvrent", "v3__t___zz ipre 3pl")
    res = InflectionResult("Couvrent-chef élégant", "")
    ok, reason = inflection_is_safe(
        "Couvre-chef élégant", res, {"nom", "mas", "pl"}, idx
    )
    assert not ok
    assert reason == "hyphenated compound element"
