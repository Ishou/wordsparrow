"""Tests for deriving `-ment` adverb clues from the base adjective's clue."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from derive_adverb_clue import adverbialise, base_adjective, derive_adverb_clue  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lex() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


@pytest.fixture(scope="module")
def index() -> MorphologyIndex:
    lex = _lex()
    if lex is None:
        pytest.skip("grammalecte lexique absent")
    return MorphologyIndex.load(lex)


@pytest.mark.parametrize("adverb,expected", [
    ("terriblement", "terrible"),
    ("rapidement", "rapide"),
    ("doucement", "doux"),        # via feminine `douce`
    ("follement", "fou"),         # via feminine `folle`
    ("prudemment", "prudent"),    # -emment -> -ent
    ("méchamment", "méchant"),    # -amment -> -ant
    ("vraiment", "vrai"),
    ("absolument", "absolu"),
    ("énormément", "énorme"),     # -ément -> -e
])
def test_base_adjective(index: MorphologyIndex, adverb: str, expected: str) -> None:
    assert base_adjective(adverb, index) == expected


@pytest.mark.parametrize("nonadverb", ["mordillement", "souvent", "moment", "ciment"])
def test_base_adjective_rejects_non_derived(index: MorphologyIndex, nonadverb: str) -> None:
    # `-ment` nouns (mordillement, ciment) and primitive adverbs (souvent) have no base adjective.
    assert base_adjective(nonadverb, index) is None


def test_adverbialise_wraps_a_feminisable_adjective_clue(index: MorphologyIndex) -> None:
    assert adverbialise("Effrayant", index) == "De façon effrayante"


def test_adverbialise_skips_non_adjective_head(index: MorphologyIndex) -> None:
    # A relative-clause / verb clue can't be adverbialised cleanly -> skip, don't mangle.
    assert adverbialise("Qui fait peur", index) is None


def test_derive_end_to_end(index: MorphologyIndex) -> None:
    adj_clue_of = {"terrible": "Effrayant", "rapide": "Qui va vite"}
    assert derive_adverb_clue("terriblement", adj_clue_of, index) == "De façon effrayante"
    # rapide's clue is a relative clause -> not adverbialisable -> None
    assert derive_adverb_clue("rapidement", adj_clue_of, index) is None
    # no base-adjective clue available -> None
    assert derive_adverb_clue("terriblement", {}, index) is None
