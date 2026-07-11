"""Unit test for build_gold_corpus: gold clues.csv -> inflator corpus shape."""
from __future__ import annotations
import csv, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "clue_generation"))
import build_gold_corpus as bg


def test_gold_rows_maps_pos_rows_and_skips_incomplete(tmp_path):
    d = tmp_path / "data/curated/generation-gold-x"
    d.mkdir(parents=True)
    (d / "clues.csv").write_text(
        "lemma,clue,pos,source\n"
        "lier,Attacher,verbe,bliss-authored\n"
        "lie,Dépôt du vin,nom,bliss-authored\n"
        ",Orphan clue,verbe,bliss-authored\n"   # blank lemma -> skipped
        "sansPos,Clue,,bliss-authored\n",       # blank pos -> skipped
        encoding="utf-8",
    )
    rows = list(bg.gold_rows(tmp_path))
    assert {(r["lemma"], r["pos"], r["lemma_clue"]) for r in rows} == {
        ("lier", "verbe", "Attacher"),
        ("lie", "nom", "Dépôt du vin"),
    }
    assert all(r["validation_flag"] == "ok" and r["filter_score"] == "1.0" for r in rows)
    assert all(set(r) == set(bg.CORPUS_FIELDS) for r in rows)
