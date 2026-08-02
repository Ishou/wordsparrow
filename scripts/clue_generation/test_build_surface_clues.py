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
    """`comblez → "Capable de satisfaire"`: real head sits past a leading non-verb content word — the scan must keep going, not stop at the first token."""
    idx = _pp_homograph_index()
    _add(idx, "capable", "capable", "adj epi sg")
    corpus = {("combler", "verbe"): [_clue("combler", "verbe", "Capable de satisfaire")]}
    rows = build_surface_rows("comblez", corpus, idx, {})
    assert len(rows) == 1, rows
    assert rows[0]["clue"] == "Capable de satisfaites", rows
    assert rows[0]["inflection_status"] == "pp-adjective-homograph", rows


def _number_index() -> MorphologyIndex:
    idx = MorphologyIndex()
    _add(idx, "œil", "œil", "nom mas sg")
    _add(idx, "œil", "œils", "nom mas pl")
    _add(idx, "main", "main", "nom fem sg")
    _add(idx, "main", "mains", "nom fem pl")
    _add(idx, "doigt", "doigt", "nom mas sg")
    _add(idx, "doigt", "doigts", "nom mas pl")
    _add(idx, "permettre", "permet", "v3__t___zz ipre 3sg")
    _add(idx, "voir", "voir", "v3__t___zz infi")
    _add(idx, "avoir", "a", "v3__t___zz ipre 3sg")
    _add(idx, "falloir", "faut", "v3__i___zz ipre 3sg")
    return idx


def test_plural_noun_with_singular_il_clue_is_dropped() -> None:
    """`œils → "Il permet de voir"`: singular pronoun on a plural noun answer."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il permet de voir")]}
    rows = build_surface_rows("œils", corpus, idx, {})
    assert rows[0]["inflection_status"] == "subject-number-mismatch", rows


def test_plural_noun_with_singular_elle_clue_is_dropped() -> None:
    """`mains → "Elle a cinq doigts"`: singular Elle on a plural noun answer."""
    idx = _number_index()
    corpus = {("main", "nom"): [_clue("main", "nom", "Elle a cinq doigts")]}
    rows = build_surface_rows("mains", corpus, idx, {})
    assert rows[0]["inflection_status"] == "subject-number-mismatch", rows


def test_singular_noun_with_singular_il_clue_is_kept() -> None:
    """No over-drop: the singular surface (œil) keeps its singular-pronoun clue."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il permet de voir")]}
    rows = build_surface_rows("œil", corpus, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def test_plural_noun_with_impersonal_il_is_kept() -> None:
    """Impersonal `il faut` doesn't stand for the answer — not a disagreement."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il faut voir")]}
    rows = build_surface_rows("œils", corpus, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def test_plural_noun_with_impersonal_il_sagit_is_kept() -> None:
    """`Il s'agit de ...` is impersonal and doesn't stand for the answer; the apostrophe token split must not defeat detection."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il s'agit de voir")]}
    rows = build_surface_rows("œils", corpus, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def test_plural_noun_with_negated_impersonal_il_faut_is_kept() -> None:
    """`Il ne faut pas ...` is impersonal; the negation particle must not defeat detection of `faut`."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il ne faut pas rêver")]}
    rows = build_surface_rows("œils", corpus, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def test_plural_noun_with_negated_impersonal_il_y_a_is_kept() -> None:
    """`Il n'y a pas ...` is impersonal; the apostrophe token split must not defeat detection of `y`."""
    idx = _number_index()
    corpus = {("œil", "nom"): [_clue("œil", "nom", "Il n'y a pas de doute")]}
    rows = build_surface_rows("œils", corpus, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def test_plural_noun_with_negated_il_sagit_is_kept() -> None:
    """`Il ne s'agit pas de ...` is impersonal despite the negation between il and s'agit."""
    idx = _number_index()
    rows = build_surface_rows("œils", {("œil", "nom"): [_clue("œil", "nom", "Il ne s'agit pas de voir")]}, idx, {})
    assert rows[0]["inflection_status"] != "subject-number-mismatch", rows


def _ambiguous_head_index() -> MorphologyIndex:
    """`porte` is both a verb form (porter, ipre 3sg/3pl) and a noun (fem);
    mirrors the `test_inflect_clue.py` fixture used for the same ambiguity."""
    idx = MorphologyIndex()
    _add(idx, "porter", "porter", "v1__t___zz infi")
    _add(idx, "porter", "porte", "v1__t___zz ipre 3sg")
    _add(idx, "porter", "portent", "v1__t___zz ipre 3pl")
    _add(idx, "porte", "porte", "nom fem sg")
    _add(idx, "porte", "portes", "nom fem pl")
    _add(idx, "service", "service", "nom mas sg")
    _add(idx, "service", "services", "nom mas pl")
    return idx


def test_corpus_row_head_pos_reaches_inflect_clue_and_agrees_the_verb() -> None:
    """A gold row's `head_pos` column (wired via `build_gold_corpus.py`) must
    reach `inflect_clue`'s `authored_head_pos` — settling the noun/verb
    ambiguity that ADR-0107 otherwise resolves conservatively."""
    idx = _ambiguous_head_index()
    row = _clue("service", "nom", "Porte un service")
    row["head_pos"] = "verbe"
    rows = build_surface_rows("services", {("service", "nom"): [row]}, idx, {})
    assert rows[0]["clue"] == "Portent un service", rows


def test_corpus_row_without_head_pos_keeps_the_conservative_nominal_reading() -> None:
    """No hint (the pre-existing gold shape) keeps the ambiguous head's
    nominal reading — the same corpus row inflects differently once head_pos
    is set (see the sibling test above)."""
    idx = _ambiguous_head_index()
    row = _clue("service", "nom", "Porte un service")
    rows = build_surface_rows("services", {("service", "nom"): [row]}, idx, {})
    assert rows[0]["clue"] == "Portes un service", rows
