"""Unit tests for assemble_corpus.merge / apply_overrides — the
normalize-then-merge assembler (ADR-0100). Pure-dict fixtures; no
grammalecte lexique needed (that's corpus_normalizers' concern, already
covered by test_corpus_normalizers.py)."""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

import assemble_corpus as ac  # noqa: E402


def _row(word, clue, source="bliss", pos="", lemma="", language="fr"):
    return {
        "word": word,
        "language": language,
        "length": str(len(word)),
        "frequency": "100000",
        "difficulty": "",
        "clue": clue,
        "source": source,
        "source_license": "CC0-1.0",
        "pos": pos,
        "lemma": lemma or word,
    }


_LONG = "Physicien français de l'électricité"  # 35 chars, doesn't fit a cell


def test_gate_cell_fit_drops_overflow_when_fitting_alternative_exists():
    rows = [
        _row("ampere", _LONG, pos="nom"),
        _row("ampere", "Savant", pos="nom"),
    ]
    kept, dropped = ac.gate_cell_fit(rows)
    assert dropped == 1
    assert [r["clue"] for r in kept] == ["Savant"]


def test_gate_cell_fit_keeps_a_words_only_clue_even_if_overflow():
    rows = [_row("ampere", _LONG, pos="nom")]
    kept, dropped = ac.gate_cell_fit(rows)
    assert dropped == 0
    assert [r["clue"] for r in kept] == [_LONG]


def test_gate_cell_fit_empty_placeholder_is_not_a_fitting_alternative():
    # A blank grammalecte anchor + an overflow clue: the overflow is the word's
    # only real clue, so it stays (not dropped to just the placeholder).
    rows = [_row("ampere", "", source="grammalecte"), _row("ampere", _LONG)]
    kept, dropped = ac.gate_cell_fit(rows)
    assert dropped == 0
    assert _LONG in [r["clue"] for r in kept]


def test_gate_cell_fit_is_case_sensitive():
    # `IX` (roman, fitting) and `ix` (only an overflow clue) are distinct grid
    # surfaces — IX's fitting clue must not credit `ix` and drop its sole clue.
    rows = [_row("IX", "Neuf en chiffres romains"), _row("ix", _LONG)]
    kept, dropped = ac.gate_cell_fit(rows)
    assert dropped == 0
    assert _LONG in [r["clue"] for r in kept]


def test_source_priority_order():
    assert ac.SOURCE_PRIORITY == [
        "overrides", "curated", "themed", "gold", "editorial", "grammalecte", "llm",
    ]


def test_merge_identical_word_clue_keeps_higher_priority_source():
    # Same (word, clue) key appears in two tiers; the earlier (higher
    # priority) tier's row must win, not the later one.
    curated = [_row("lie", "Dépôt au fond du fût", source="bliss", pos="nom", lemma="lie")]
    grammalecte = [_row("lie", "Dépôt au fond du fût", source="grammalecte", pos="nom", lemma="lie")]

    out = ac.merge([curated, grammalecte])

    assert len(out) == 1
    assert out[0]["source"] == "bliss"


def test_merge_lemma_distinct_rows_for_same_surface_both_survive():
    # The forward-inflation payoff: `lie` as a verb form of `lier` and
    # `lie` as the noun `lie` carry DIFFERENT clues -- both must ship,
    # because the grid dedup relies on distinct lemmas being present.
    verb_row = _row("lie", "Attache par un lien", source="bliss", pos="verbe", lemma="lier")
    noun_row = _row("lie", "Dépôt au fond du fût", source="bliss", pos="nom", lemma="lie")

    out = ac.merge([[verb_row, noun_row]])

    assert len(out) == 2
    lemmas = {r["lemma"] for r in out}
    assert lemmas == {"lier", "lie"}


def test_merge_dedup_key_ignores_case_of_word():
    upper = _row("LIE", "Dépôt au fond du fût", source="curated")
    lower = _row("lie", "Dépôt au fond du fût", source="grammalecte")

    out = ac.merge([[upper], [lower]])

    assert len(out) == 1
    assert out[0]["source"] == "curated"


def test_merge_sorts_by_language_word_pos_clue():
    rows = [
        _row("zoo", "Parc animalier", pos="nom"),
        _row("ami", "Compagnon de confiance", pos="nom"),
        _row("ami", "Allié intime", pos="nom"),
    ]
    out = ac.merge([rows])
    assert [r["clue"] for r in out] == [
        "Allié intime", "Compagnon de confiance", "Parc animalier",
    ]


def test_merge_is_idempotent():
    tiers = [
        [_row("lie", "Attache par un lien", source="bliss", pos="verbe", lemma="lier")],
        [_row("lie", "Dépôt au fond du fût", source="grammalecte", pos="nom", lemma="lie")],
        [_row("mu", "Lettre grecque", source="llm", pos="nom", lemma="mu")],
    ]
    first = ac.merge(tiers)
    second = ac.merge([first])
    assert second == first


def test_apply_overrides_replaces_matching_word_clue():
    rows = [_row("pain", "Aliment de base", source="llm")]
    overrides = {"pain": "Souffrance morale"}

    out = ac.apply_overrides(rows, overrides)

    assert out[0]["clue"] == "Souffrance morale"


def test_apply_overrides_leaves_non_matching_rows_untouched():
    rows = [_row("pain", "Aliment de base", source="llm")]
    overrides = {"autre": "Autre chose"}

    out = ac.apply_overrides(rows, overrides)

    assert out[0]["clue"] == "Aliment de base"


def test_apply_overrides_dedups_homograph_collapsed_by_override():
    # Finding 4: `lie` ships two lemma-distinct rows (lier + lie). A
    # word-scoped override rewrites BOTH to the same clue, collapsing two
    # distinct (word, clue) keys into one duplicate that merge() never saw.
    # apply_overrides must re-dedup rather than emit the duplicate.
    rows = [
        _row("lie", "Attache par un lien", source="bliss", pos="verbe", lemma="lier"),
        _row("lie", "Dépôt au fond du fût", source="bliss", pos="nom", lemma="lie"),
    ]
    overrides = {"lie": "Résidu de vin"}

    out = ac.apply_overrides(rows, overrides)

    assert len(out) == 1
    assert out[0]["clue"] == "Résidu de vin"


# --- gate_grammalecte (Findings 2 + 3) -----------------------------------

def test_gate_grammalecte_drops_surface_already_covered_by_higher_tier():
    # Finding 2: `bras` is already emitted by a curated tier, so the
    # grammalecte candidate must NOT produce a second (placeholder) row.
    surfaces = {"bras": ("bras", 5000)}
    out = ac.gate_grammalecte(surfaces, anchored_lemmas={"bras"}, covered_words={"bras"})
    assert out == {}


def test_gate_grammalecte_drops_surface_whose_lemma_is_not_anchored():
    # Finding 3: lemma-anchored admission. `xylophones` has no in-corpus
    # lemma, so it is not admitted even though it clears any length band.
    surfaces = {"xylophones": ("xylophone", 3)}
    out = ac.gate_grammalecte(surfaces, anchored_lemmas={"bras"}, covered_words=set())
    assert out == {}


def test_gate_grammalecte_admits_anchored_uncovered_surface():
    surfaces = {"bras": ("bras", 5000), "clignotais": ("clignoter", 1)}
    out = ac.gate_grammalecte(
        surfaces,
        anchored_lemmas={"clignoter"},
        covered_words=set(),
    )
    assert out == {"clignotais": ("clignoter", 1)}
