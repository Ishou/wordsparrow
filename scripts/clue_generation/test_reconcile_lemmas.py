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

import reconcile_lemmas  # noqa: E402
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


def test_derive_lemma_verb_unique(index):
    assert reconcile_lemmas.derive_lemma("lia", "verbe", index) == ("ok", "lier")


def test_derive_lemma_verb_ambiguous(index):
    assert reconcile_lemmas.derive_lemma("tue", "verbe", index) == ("ambiguous", None)


def test_derive_lemma_invariable_is_self(index):
    assert reconcile_lemmas.derive_lemma("es", "abr", index) == ("ok", "es")
    assert reconcile_lemmas.derive_lemma("mcm", "note", index) == ("ok", "mcm")


def test_derive_lemma_noun_unconfirmed_is_self(index):
    # grammalecte lacks the noun `vue`; pos=nom must fall back to self, not `vu`.
    assert reconcile_lemmas.derive_lemma("vue", "nom", index) == ("ok", "vue")


def test_derive_lemma_noun_confirmed(index):
    assert reconcile_lemmas.derive_lemma("lie", "nom", index) == ("ok", "lie")


def test_reconcile_pos_scoped_note_vs_verb(index):
    # es/abr keeps es; es/verbe must be être.
    assert reconcile("es", "es", index, pos="abr") == ("ok", "es")
    assert reconcile("es", "es", index, pos="verbe") == ("fixed", "être")


def test_wrong_invariable_pos_fixes_pure_verb_forms(index):
    # gold mislabels short verb forms as `abr`; grammalecte knows them only as
    # verb inflections, so the invariable claim is provably wrong.
    assert reconcile_lemmas.wrong_invariable_pos("lia", "abr", index) == "lier"
    assert reconcile_lemmas.wrong_invariable_pos("nia", "abr", index) == "nier"


def test_wrong_invariable_pos_spares_real_homographs_and_sigles(index):
    # `es` has a real invariable-noun reading (the note); `cc` has no verb
    # reading — neither is a provably-wrong invariable.
    assert reconcile_lemmas.wrong_invariable_pos("es", "abr", index) is None
    assert reconcile_lemmas.wrong_invariable_pos("cc", "abr", index) is None


def test_guard_catches_verb_form_mislabelled_invariable(index):
    assert reconcile("lia", "lia", index, pos="abr") == ("fixed", "lier")


def test_guard_is_lenient_on_nominal_plurals(index):
    # `abats` reads as both noun `abat` and verb `abattre`; a nom row is fine
    # whether it carries the singular head or the surface itself.
    assert reconcile("abats", "abat", index, pos="nom") == ("ok", "abat")
    assert reconcile("abats", "abats", index, pos="nom") == ("ok", "abats")


def test_guard_accepts_grammalecte_gap_noun(index):
    # the noun `vue` is absent from grammalecte; nom/self must not be flagged.
    assert reconcile("vue", "vue", index, pos="nom") == ("ok", "vue")
