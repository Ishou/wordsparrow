"""Tests for build_missing_noun_queue.fold / grid_foldable / blocked."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_missing_noun_queue import blocked, fold, grid_foldable  # noqa: E402


def test_fold_strips_diacritics():
    assert fold("murât") == "murat"


def test_fold_expands_ligatures():
    assert fold("œuf") == "oeuf"
    assert fold("cæsium") == "caesium"


def test_grid_foldable_true_for_accented_alpha():
    assert grid_foldable("café")


def test_grid_foldable_false_for_non_alpha():
    assert not grid_foldable("naive-toy")
    assert not grid_foldable("3d")


def test_blocked_matches_exact_stem():
    assert blocked("negro")


def test_blocked_matches_stem_prefix():
    assert blocked("negrophile")


def test_blocked_false_for_unrelated_word():
    assert not blocked("abricot")


def test_blocked_is_accent_and_case_insensitive():
    assert blocked("NÉGRO")


def test_blocked_matches_abbreviation():
    assert blocked("suppl")


def test_blocked_matches_accented_abbreviation():
    assert blocked("déc")


def test_blocked_abbreviation_is_accent_and_case_insensitive():
    assert blocked("DEC")
    assert blocked("Suppl")


def test_blocked_false_for_legitimate_clipped_word():
    assert not blocked("frigo")
    assert not blocked("prépa")


def _write_fixtures(tmp_path):
    lexique = tmp_path / "lex.txt"
    lexique.write_text(
        "\n".join(
            "\t".join(["0", "1", w, w, "nom mas sg", "", "", "", "", "", "", str(freq)])
            for w, freq in (("village", 900), ("wagon", 800), ("maison", 700))
        )
        + "\n",
        encoding="utf-8",
    )
    corpus = tmp_path / "corpus.csv"
    corpus.write_text("word,clue\nautre,Définition\n", encoding="utf-8")
    tally = tmp_path / "tally.csv"
    tally.write_text("word,placements\nMAISON,5\n", encoding="utf-8")
    return lexique, corpus, tally


def _run(monkeypatch, args):
    import build_missing_noun_queue as m

    monkeypatch.setattr(sys, "argv", ["build_missing_noun_queue.py", *args])
    m.main()


def test_tally_does_not_filter_the_queue(tmp_path, monkeypatch):
    lexique, corpus, tally = _write_fixtures(tmp_path)
    out = tmp_path / "out.txt"
    _run(monkeypatch, ["--lexique", str(lexique), "--corpus", str(corpus),
                       "--tally", str(tally), "--out", str(out)])
    queued = out.read_text(encoding="utf-8").split()
    assert "village" in queued and "wagon" in queued


def test_queue_is_identical_with_and_without_a_tally(tmp_path, monkeypatch):
    lexique, corpus, tally = _write_fixtures(tmp_path)
    with_tally, without = tmp_path / "a.txt", tmp_path / "b.txt"
    _run(monkeypatch, ["--lexique", str(lexique), "--corpus", str(corpus),
                       "--tally", str(tally), "--out", str(with_tally)])
    _run(monkeypatch, ["--lexique", str(lexique), "--corpus", str(corpus), "--out", str(without)])
    assert with_tally.read_text(encoding="utf-8") == without.read_text(encoding="utf-8")


def test_queue_is_ranked_by_familiarity(tmp_path, monkeypatch):
    lexique, corpus, _ = _write_fixtures(tmp_path)
    out = tmp_path / "out.txt"
    _run(monkeypatch, ["--lexique", str(lexique), "--corpus", str(corpus), "--out", str(out)])
    assert out.read_text(encoding="utf-8").split() == ["village", "wagon", "maison"]


def test_tally_coverage_line_does_not_crash_on_an_empty_queue(tmp_path, monkeypatch, capsys):
    lexique, _, tally = _write_fixtures(tmp_path)
    corpus = tmp_path / "corpus_full.csv"
    corpus.write_text("word,clue\nvillage,Définition\nwagon,Définition\nmaison,Définition\n", encoding="utf-8")
    out = tmp_path / "out.txt"
    _run(monkeypatch, ["--lexique", str(lexique), "--corpus", str(corpus),
                       "--tally", str(tally), "--out", str(out)])
    assert out.read_text(encoding="utf-8") == "\n"
    assert "n/a, queue is empty" in capsys.readouterr().out
