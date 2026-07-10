"""Unit tests for reconcile_lemmas — driven against the real grammalecte
lexique so the invariant is exercised on true morphology, not a mock.
Skips gracefully when the lexique is absent (public CI without the data
file); the logic still runs wherever the lexique is available."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from morphology_index import MorphologyIndex  # noqa: E402
from reconcile_lemmas import reconcile  # noqa: E402

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


@pytest.fixture(scope="module")
def index() -> MorphologyIndex:
    lex = _lexique()
    if lex is None:
        pytest.skip("grammalecte lexique absent")
    return MorphologyIndex.load(lex)


def test_pure_inflected_form_with_surface_lemma_is_fixed(index):
    # `lia` is only ever a form of `lier`; the surface-defaulted lemma is invalid.
    assert reconcile("lia", "lia", index) == ("fixed", "lier")
    assert reconcile("nia", "nia", index) == ("fixed", "nier")
    assert reconcile("tua", "tua", index) == ("fixed", "tuer")


def test_correct_lemma_is_left_alone(index):
    assert reconcile("lia", "lier", index) == ("ok", "lier")


def test_homograph_self_lemma_coexists(index):
    # `lie` is a form of BOTH the noun `lie` and the verb `lier`; the noun
    # reading is a valid lemma and must NOT be collapsed into `lier`.
    assert reconcile("lie", "lie", index) == ("ok", "lie")
    assert reconcile("lie", "lier", index) == ("ok", "lier")


def test_ambiguous_form_is_never_guessed(index):
    # `tue` is a form of both `taire` and `tuer` — refuse to pick.
    status, lemma = reconcile("tue", "tue", index)
    assert status == "ambiguous"
    assert lemma == "tue"


def test_override_resolves_ambiguous_form(index):
    assert reconcile("tue", "tue", index, {"tue": "tuer"}) == ("override", "tuer")


def test_override_must_itself_be_valid(index):
    # An override that isn't a real lemma of the surface is a mistake, flagged.
    status, _ = reconcile("tue", "tue", index, {"tue": "lier"})
    assert status == "bad-override"


def test_unknown_surface_keeps_its_lemma(index):
    # Roman numerals grammalecte doesn't know (mcm = 1900): each is its own lemma.
    assert reconcile("mcm", "mcm", index) == ("unknown", "mcm")


def test_self_lemma_noun_is_ok(index):
    assert reconcile("bar", "bar", index) == ("ok", "bar")


def test_abbreviations_are_kept_not_decomposed(index):
    # grammalecte hands these invariable sigles a spurious single-letter lemma
    # (am->m, cg->g, ns->s). They are their own lemma — never rewrite them.
    assert reconcile("am", "am", index) == ("kept", "am")
    assert reconcile("cg", "cg", index) == ("kept", "cg")
    assert reconcile("ns", "ns", index) == ("kept", "ns")


def test_verb_form_with_spurious_noun_reading_resolves(index):
    # `es` reads as inv-noun `s` AND verb `être`; the noun reading is ignored
    # so it resolves cleanly to the verb rather than going ambiguous.
    assert reconcile("es", "es", index) == ("fixed", "être")


def test_plural_noun_is_fixed_to_singular(index):
    assert reconcile("ares", "ares", index) == ("fixed", "are")
