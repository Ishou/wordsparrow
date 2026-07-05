"""Surface-tier number-agreement gate: guards against literary inversion-form verbs (tagged `1isg/2isg/3isg`, absent from PERSON_TOKENS) inflating to a person-unconstrained, wrong-number head."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "eval"))

from build_surface_clues import (  # noqa: E402
    _verb_number,
    classify_inflection,
    classify_surface_inflection,
)
from morphology_index import MorphologyIndex  # noqa: E402


def _add(idx: MorphologyIndex, lemma: str, surface: str, tags: str) -> None:
    ts = frozenset(tags.split())
    idx.by_lemma.setdefault(lemma, []).append((surface, ts))
    idx.by_form.setdefault(surface, []).append((lemma, ts))


def _placer_index() -> MorphologyIndex:
    """Mirrors grammalecte's placer emission order, where `placent` (3pl) is reached first once the person constraint is dropped."""
    idx = MorphologyIndex()
    _add(idx, "placer", "placer", "v1__tnq__a infi")
    _add(idx, "placer", "placent", "v1__tnq__a ipre 3pl")
    _add(idx, "placer", "place", "v1__tnq__a ipre 1sg 2sg 3sg")
    return idx


def test_verb_number_maps_inversion_person_to_singular() -> None:
    assert _verb_number({"ipre", "1isg"}) == "sg"
    assert _verb_number({"ipre", "3pl"}) == "pl"
    assert _verb_number({"nom", "mas", "inv"}) is None


def test_singular_inversion_surface_is_skipped_at_inflater() -> None:
    """`posè` (ipre 1isg) has no person `PERSON_TOKENS` can match, so the inflater now SKIPS it (`no-inflection-finite`) at the root rather than emitting the arbitrary plural `Placent` the downstream agreement gate had to catch."""
    idx = _placer_index()
    surface_tags = {"ipre", "1isg", "v1_itxq__a"}
    clue, status = classify_inflection("Placer", surface_tags, idx)
    assert status == "no-inflection-finite", (clue, status)
    assert clue == "Placer"  # verbatim citation form, not the arbitrary plural


def test_homograph_head_with_achievable_number_is_kept() -> None:
    idx = MorphologyIndex()
    _add(idx, "être", "être", "v3___nq__a infi")
    _add(idx, "être", "sommes", "v3___nq__a ipre 1pl")
    _add(idx, "sommer", "sommes", "v1__t___zz ipre 2sg")
    surface_tags = {"ipre", "1pl", "v3___nq__a"}
    _clue, status = classify_inflection("Être", surface_tags, idx)
    assert status == "inflected", status


def test_singular_surface_with_singular_clue_is_kept() -> None:
    idx = _placer_index()
    surface_tags = {"ipre", "3sg", "v1_itxq__a"}
    _clue, status = classify_inflection("Placer", surface_tags, idx)
    assert status == "inflected", status


def _tenir_index() -> MorphologyIndex:
    """`Tenir compte de` — head `tenir`, with the passé-simple rows that make `considérai/considéras` inflate to the archaic `Tins compte de`."""
    idx = MorphologyIndex()
    _add(idx, "tenir", "tenir", "v3__t___zz infi")
    _add(idx, "tenir", "tins", "v3__t___zz ipsi 1sg 2sg")
    _add(idx, "tenir", "tint", "v3__t___zz ipsi 3sg")
    _add(idx, "tenir", "tinrent", "v3__t___zz ipsi 3pl")
    return idx


def test_passe_simple_first_person_is_dropped() -> None:
    """`considérai` (1sg ipsi) cluing `Tenir compte de` inflates to the archaic `Tins compte de` — routed to `passe-simple-person` (dropped)."""
    idx = _tenir_index()
    clue, status = classify_surface_inflection(
        "Tenir compte de", {"ipsi", "1sg", "v3__t___zz"}, idx)
    assert status == "passe-simple-person", (clue, status)
    assert clue == "Tins compte de"  # the archaic form we refuse to ship


def test_passe_simple_second_person_is_dropped() -> None:
    idx = _tenir_index()
    _clue, status = classify_surface_inflection(
        "Tenir compte de", {"ipsi", "2sg", "v3__t___zz"}, idx)
    assert status == "passe-simple-person", status


def test_passe_simple_third_person_is_kept() -> None:
    """3rd-person passé simple is narrative-standard, not archaic — `considéra → "Tint compte de"` still ships."""
    idx = _tenir_index()
    clue, status = classify_surface_inflection(
        "Tenir compte de", {"ipsi", "3sg", "v3__t___zz"}, idx)
    assert status == "inflected", (clue, status)
    assert clue == "Tint compte de"


def test_subject_person_mismatch_flows_through_to_surface_status() -> None:
    """The `inflect_clue` subject guard surfaces as a droppable status through the surface-tier wrapper too."""
    idx = MorphologyIndex()
    _add(idx, "sueur", "sueur", "nom fem sg")
    _add(idx, "apparaître", "apparaître", "v3__i___zz infi")
    _add(idx, "apparaître", "apparaît", "v3__i___zz ipre 3sg")
    _add(idx, "apparaître", "apparaîtras", "v3__i___zz ifut 2sg")
    _clue, status = classify_surface_inflection(
        "La sueur apparaît", {"ifut", "2sg", "v3__i___zz"}, idx)
    assert status == "subject-person-mismatch", status
