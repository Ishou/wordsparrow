"""apply_homograph_fix must re-validate a replacement against the row's POS,
not trust the diff's self-reported `new_flag` — the `score -> Obtenir` leak."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from apply_homograph_fix import apply_replacements  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


@pytest.mark.skipif(_lexique() is None, reason="grammalecte lexique absent")
def test_pos_mismatched_replacement_is_rejected_despite_ok_new_flag() -> None:
    index = MorphologyIndex.load(_lexique())
    rows = [{"lemma": "score", "pos": "nom", "lemma_clue": "Total",
             "validation_flag": "ok", "filter_score": "0.9997"}]
    # The diff self-reports ok — exactly the stale flag that let this ship.
    diffs = [{"lemma": "score", "old_clue": "Total", "new_clue": "Obtenir",
              "new_flag": "ok", "new_score": "0.9997", "score_delta": "0.10"}]
    stats = apply_replacements(rows, diffs, index)
    assert stats["rejected_flag"] == 1 and stats.get("replaced", 0) == 0
    assert rows[0]["lemma_clue"] == "Total"  # unchanged — verb clue rejected


@pytest.mark.skipif(_lexique() is None, reason="grammalecte lexique absent")
def test_pos_matched_replacement_applies_to_its_pos_row() -> None:
    index = MorphologyIndex.load(_lexique())
    rows = [{"lemma": "score", "pos": "nom", "lemma_clue": "Total",
             "validation_flag": "ok", "filter_score": "0.90"}]
    diffs = [{"lemma": "score", "old_clue": "Total", "new_clue": "Résultat chiffré",
              "new_flag": "ok", "new_score": "0.95", "score_delta": "0.10"}]
    stats = apply_replacements(rows, diffs, index)
    assert stats["replaced"] == 1
    assert rows[0]["lemma_clue"] == "Résultat chiffré"
