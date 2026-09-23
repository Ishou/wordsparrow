"""Tests for `build_inflected_rows.inflection_is_safe` and `main`'s row assembly."""
from __future__ import annotations

import csv
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


def test_rejects_a_token_whose_replacement_has_a_different_lemma() -> None:
    """A malformed inflection can swap in an unrelated word; when the changed token's own lemma differs from the original token's, the row is dropped rather than shipped."""
    idx = _noun_index()
    _add(idx, "mer", "mer", "nom fem sg")
    res = InflectionResult("Du mer tonneau", "")
    ok, reason = inflection_is_safe(
        "Du même tonneau", res, {"nom", "mas", "pl"}, idx
    )
    assert not ok
    assert reason == "lemma drift"


# main() — row assembly: dedup, the char cap, and frequency lookup.
def _write_fixtures(tmp_path: Path) -> tuple[Path, Path, Path]:
    lexique = tmp_path / "lex.txt"
    header = "id\tvariante\tFlexion\tLemme\tÉtiquettes\tc5\tc6\tc7\tc8\tc9\tc10\tTotal occurrences\n"
    rows = "\n".join(
        "\t".join(["1", "v", form, lemma, tags, "", "", "", "", "", "", str(freq)])
        for form, lemma, tags, freq in (
            ("astre", "astre", "nom mas sg", 900),
            ("astres", "astre", "nom mas pl", 50),
            ("service", "service", "nom mas sg", 700),
            ("services", "service", "nom mas pl", 40),
            ("porte", "porte", "nom fem sg", 600),
            ("portes", "porte", "nom fem pl", 30),
        )
    )
    lexique.write_text(header + rows + "\n", encoding="utf-8")

    clues = tmp_path / "clues.csv"
    clues.write_text(
        "lemma,clue,pos,head_pos\n"
        "astre,Astre,nom,\n"
        "service,Service offert à la communauté,nom,\n"
        "porte,Porte,nom,\n",
        encoding="utf-8",
    )

    corpus = tmp_path / "corpus.csv"
    corpus.write_text("word,clue\nastre,Astre\nportes,Portes\n", encoding="utf-8")
    return lexique, clues, corpus


def _run(monkeypatch, tmp_path: Path, lexique: Path, clues: Path, corpus: Path) -> set[tuple[str, str]]:
    import build_inflected_rows as m

    out = tmp_path / "out.csv"
    monkeypatch.setattr(sys, "argv", [
        "build_inflected_rows.py",
        "--clues", str(clues), "--lexique", str(lexique),
        "--corpus", str(corpus), "--out", str(out),
    ])
    m.main()
    return {(r["word"], r["clue"]) for r in csv.DictReader(out.open(encoding="utf-8"))}


def test_lemma_row_already_in_corpus_is_not_duplicated(tmp_path, monkeypatch) -> None:
    lexique, clues, corpus = _write_fixtures(tmp_path)
    rows = _run(monkeypatch, tmp_path, lexique, clues, corpus)
    assert ("astre", "Astre") not in rows  # already shipped; dedup keeps the corpus authoritative
    assert ("astres", "Astres") in rows  # inflected surface is new and under the char cap


def test_inflected_row_over_the_char_cap_is_dropped(tmp_path, monkeypatch) -> None:
    lexique, clues, corpus = _write_fixtures(tmp_path)
    rows = _run(monkeypatch, tmp_path, lexique, clues, corpus)
    assert ("service", "Service offert à la communauté") in rows  # lemma row ships regardless of length
    assert not any(word == "services" for word, _clue in rows)  # inflected text exceeds MAX_CLUE_CHARS


def test_inflected_row_already_in_corpus_is_dropped(tmp_path, monkeypatch) -> None:
    lexique, clues, corpus = _write_fixtures(tmp_path)
    rows = _run(monkeypatch, tmp_path, lexique, clues, corpus)
    assert ("porte", "Porte") in rows  # lemma row is new
    assert ("portes", "Portes") not in rows  # inflected row already shipped
