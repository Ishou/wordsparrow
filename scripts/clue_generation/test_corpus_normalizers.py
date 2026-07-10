"""Unit tests for corpus_normalizers — driven against the real grammalecte
lexique so pos/lemma derivation is exercised on true morphology, not a mock.
Skips gracefully when the lexique is absent (public CI without the data
file); the logic still runs wherever the lexique is available."""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

import corpus_normalizers as cn  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

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


def test_unified_fields_shape():
    assert cn.UNIFIED_FIELDS == [
        "word", "language", "length", "frequency", "difficulty",
        "clue", "source", "source_license", "pos", "lemma",
    ]


# --- normalize_unified -------------------------------------------------

def test_normalize_unified_invariable_abr_fills_blank_lemma(index):
    rows = [{
        "word": "dr", "language": "fr", "length": "2", "frequency": "100000",
        "difficulty": "", "clue": "Titre de medecin", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "abr", "lemma": "",
    }]
    out = cn.normalize_unified(rows, index)
    assert len(out) == 1
    assert out[0] == {
        "word": "dr", "language": "fr", "length": "2", "frequency": "100000",
        "difficulty": "", "clue": "Titre de medecin", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "abr", "lemma": "dr",
    }


def test_normalize_unified_authored_lemma_passes_through_unchanged(index):
    rows = [{
        "word": "ami", "language": "fr", "length": "3", "frequency": "100000",
        "difficulty": "", "clue": "Compagnon de confiance", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "nom", "lemma": "ami",
    }]
    out = cn.normalize_unified(rows, index)
    assert out[0]["lemma"] == "ami"
    assert out[0]["pos"] == "nom"


def test_normalize_unified_ambiguous_verb_raises(index):
    # `tue` is a genuine inflection of BOTH `tuer` and `taire`; derive_lemma
    # returns ("ambiguous", None) for it — an authored `verbe` row with no
    # lemma must raise rather than silently surface-defaulting.
    rows = [{
        "word": "tue", "language": "fr", "length": "3", "frequency": "100000",
        "difficulty": "", "clue": "Occit", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "verbe", "lemma": "",
    }]
    with pytest.raises(ValueError, match=r"tue/verbe needs an authored lemma"):
        cn.normalize_unified(rows, index)


def test_normalize_unified_ambiguous_collects_instead_of_raising_when_asked(index):
    # With an `on_unresolved` sink the row is SKIPPED and recorded, not
    # raised — so the assembler can gather every unresolved row in one pass.
    rows = [{
        "word": "tue", "language": "fr", "length": "3", "frequency": "100000",
        "difficulty": "", "clue": "Occit", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "verbe", "lemma": "",
    }]
    sink: list = []
    out = cn.normalize_unified(rows, index, on_unresolved=sink)
    assert out == []
    assert sink == [("tue", "verbe", "bliss")]


# --- normalize_gold ------------------------------------------------------

def test_normalize_gold(tmp_path, index):
    gold_csv = tmp_path / "clues.csv"
    gold_csv.write_text(
        "lemma,clue,pos,source\n"
        'es,"Mi bémol",abr,editorial\n',
        encoding="utf-8",
    )
    out = cn.normalize_gold(gold_csv, index)
    assert out == [{
        "word": "es", "language": "fr", "length": "2", "frequency": "100000",
        "difficulty": "", "clue": "Mi bémol", "source": "gold",
        "source_license": "CC0-1.0", "pos": "abr", "lemma": "es",
    }]


def test_normalize_gold_corrects_mislabelled_short_forms(tmp_path, index):
    # gold has absorbed inflected short surfaces with a wrong pos: an invariable
    # verb form (`lia/abr`) and a verb inflection carrying its own surface as
    # lemma (`achète/verbe/achète`). Both must ship the true infinitive so grid
    # dedup works; the genuine note `es/abr` is untouched.
    gold_csv = tmp_path / "clues.csv"
    gold_csv.write_text(
        "lemma,clue,pos,source\n"
        "lia,Noua ensemble,abr,bliss-authored\n"
        "achète,Acquiert,verbe,bliss-authored\n"
        "es,Mi bémol,abr,bliss-authored\n",
        encoding="utf-8",
    )
    out = {r["word"]: (r["pos"], r["lemma"]) for r in cn.normalize_gold(gold_csv, index)}
    assert out["lia"] == ("verbe", "lier")
    assert out["achète"] == ("verbe", "acheter")
    assert out["es"] == ("abr", "es")


# --- normalize_surface_clues ----------------------------------------------

def test_normalize_surface_clues_passthrough_and_filters_non_ok():
    surface_clues_csv_header = (
        "surface,lemma,pos,clue,source_clue,inflection_status,"
        "filter_score,validation_flag\n"
    )
    rows = (
        "lie,lier,verbe,Attache,Attacher,inflected,0.9,ok\n"
        "xxx,xxx,nom,Bruit,Bruit,verbatim,0.9,rejected\n"
    )

    def _write(tmp_path):
        p = tmp_path / "surface_clues.csv"
        p.write_text(surface_clues_csv_header + rows, encoding="utf-8")
        return p

    import tempfile
    with tempfile.TemporaryDirectory() as d:
        path = _write(Path(d))
        out = cn.normalize_surface_clues(path)

    assert len(out) == 1
    assert out[0] == {
        "word": "lie", "language": "fr", "length": "3", "frequency": "100000",
        "difficulty": "", "clue": "Attache", "source": "llm",
        "source_license": "CC0-1.0", "pos": "verbe", "lemma": "lier",
    }


# --- normalize_editorial ---------------------------------------------------

def test_normalize_editorial_joins_on_mot_and_definition1(tmp_path, index):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "fr_test.csv").write_text(
        "Mot;Définition 1;Définition 2\n"
        "LIA;Attacha jadis;\n",
        encoding="utf-8",
    )
    lemmas_csv = raw_dir / "_lemmas.csv"
    lemmas_csv.write_text(
        "Mot;Sens;Lemme;Morphologie\n"
        "LIA;Attacha jadis;lier;ipsi,3sg\n",
        encoding="utf-8",
    )
    out = cn.normalize_editorial(raw_dir, lemmas_csv, index)
    assert out == [{
        "word": "lia", "language": "fr", "length": "3", "frequency": "100000",
        "difficulty": "", "clue": "Attacha jadis", "source": "bliss",
        "source_license": "CC0-1.0", "pos": "verbe", "lemma": "lier",
    }]


def test_normalize_editorial_unmapped_inflection_resolves_via_reconcile(tmp_path, index):
    # No `_lemmas` entry for LIA — must resolve via reconcile's "fixed" path (lemma="lier"), not surface-default.
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "fr_test.csv").write_text(
        "Mot;Définition 1;Définition 2\n"
        "LIA;Attacha jadis;\n",
        encoding="utf-8",
    )
    lemmas_csv = raw_dir / "_lemmas.csv"
    lemmas_csv.write_text("Mot;Sens;Lemme;Morphologie\n", encoding="utf-8")
    out = cn.normalize_editorial(raw_dir, lemmas_csv, index)
    assert len(out) == 1
    assert out[0]["lemma"] == "lier"


def test_normalize_editorial_unmapped_self_lemma_keeps_surface(tmp_path, index):
    # DIX has no `_lemmas` entry, but reconcile returns "ok" — it's legitimately its own lemma, not a silent default.
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "fr_test.csv").write_text(
        "Mot;Définition 1;Définition 2\n"
        "DIX;Nombre pair;\n",
        encoding="utf-8",
    )
    lemmas_csv = raw_dir / "_lemmas.csv"
    lemmas_csv.write_text("Mot;Sens;Lemme;Morphologie\n", encoding="utf-8")
    out = cn.normalize_editorial(raw_dir, lemmas_csv, index)
    assert len(out) == 1
    assert out[0]["lemma"] == "dix"


def test_normalize_editorial_unmapped_ambiguous_raises(tmp_path, index):
    # TUE is a genuine inflection of both `tuer` and `taire`, with no `_lemmas` entry to disambiguate.
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "fr_test.csv").write_text(
        "Mot;Définition 1;Définition 2\n"
        "TUE;Occit;\n",
        encoding="utf-8",
    )
    lemmas_csv = raw_dir / "_lemmas.csv"
    lemmas_csv.write_text("Mot;Sens;Lemme;Morphologie\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"editorial 'tue' needs an authored lemma"):
        cn.normalize_editorial(raw_dir, lemmas_csv, index)


def test_normalize_editorial_ambiguous_collects_instead_of_raising_when_asked(tmp_path, index):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "fr_test.csv").write_text(
        "Mot;Définition 1;Définition 2\n"
        "TUE;Occit;\n",
        encoding="utf-8",
    )
    lemmas_csv = raw_dir / "_lemmas.csv"
    lemmas_csv.write_text("Mot;Sens;Lemme;Morphologie\n", encoding="utf-8")
    sink: list = []
    out = cn.normalize_editorial(raw_dir, lemmas_csv, index, on_unresolved=sink)
    assert out == []
    assert sink == [("tue", None, "editorial")]


# --- normalize_grammalecte -------------------------------------------------

def test_normalize_grammalecte_derives_pos_from_matching_lemma(index):
    surfaces = {"abats": ("abat", 202)}
    out = cn.normalize_grammalecte(surfaces, index)
    assert out == [{
        "word": "abats", "language": "fr", "length": "5", "frequency": "202",
        "difficulty": "", "clue": "abats", "source": "grammalecte",
        "source_license": "MPL-2.0", "pos": "nom", "lemma": "abat",
    }]


def test_normalize_grammalecte_placeholder_clue_blank_ships_no_self_clue(index):
    # Finding 2: the assembler passes placeholder_clue="" so no grammalecte
    # row ships a `clue == word` self-clue (`abats` -> "abats").
    surfaces = {"abats": ("abat", 202)}
    out = cn.normalize_grammalecte(surfaces, index, placeholder_clue="")
    assert out[0]["clue"] == ""
    assert out[0]["word"] == "abats"
