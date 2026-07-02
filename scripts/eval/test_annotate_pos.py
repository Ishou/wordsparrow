"""Tests for annotate_pos: each POS a lemma genuinely has gets its own row, with the clue freshly validated against that POS (no dominant-POS collapse, no stale validation flag)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from annotate_pos import expand_and_validate, lemma_own_pos_classes  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _add(idx: MorphologyIndex, lemma: str, surface: str, tags: str) -> None:
    ts = frozenset(tags.split())
    idx.by_lemma.setdefault(lemma, []).append((surface, ts))
    idx.by_form.setdefault(surface, []).append((lemma, ts))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


def test_own_pos_excludes_cross_lemma_pos() -> None:
    """`porte` the noun-lemma must not inherit the verb POS of the homograph surface `porte` (which belongs to lemma `porter`)."""
    idx = MorphologyIndex()
    _add(idx, "porte", "porte", "nom fem sg")
    _add(idx, "porte", "portes", "nom fem pl")
    _add(idx, "porter", "porte", "v1__t___zz ipre 3sg")
    assert lemma_own_pos_classes("porte", idx) == {"nom"}


def test_multi_pos_lemma_emits_one_row_per_pos() -> None:
    """`acajou` is both a noun (wood) and an adjective (colour) — two rows, one per POS, each carrying the lemma's clue for its own (future) generation."""
    idx = MorphologyIndex()
    _add(idx, "acajou", "acajou", "nom mas sg")
    _add(idx, "acajou", "acajou", "adj epi sg")
    rows = [{"lemma": "acajou", "pos": "", "lemma_clue": "Bois exotique",
             "validation_flag": "ok", "filter_score": "0.9"}]
    out = expand_and_validate(rows, idx)
    assert sorted(r["pos"] for r in out) == ["adj", "nom"]
    assert {r["lemma"] for r in out} == {"acajou"}


@pytest.mark.skipif(_lexique() is None, reason="grammalecte lexique absent")
def test_stale_ok_is_recomputed_pos_mismatch_dropped() -> None:
    """The `score → Obtenir` leak: a noun lemma carrying a verb-headed clue with a stale `ok` flag must be re-derived to `pos-mismatch`, not trusted."""
    idx = MorphologyIndex.load(_lexique())
    rows = [{"lemma": "score", "pos": "", "lemma_clue": "Obtenir",
             "validation_flag": "ok", "filter_score": "0.9997"}]
    out = expand_and_validate(rows, idx)
    assert [r["pos"] for r in out] == ["nom"]
    assert out[0]["validation_flag"] == "pos-mismatch"


@pytest.mark.skipif(_lexique() is None, reason="grammalecte lexique absent")
def test_clue_attaches_to_its_matching_pos_only() -> None:
    """A noun clue on a noun+adj lemma validates ok on the noun row and mismatches on the adj row, so the clue lands on the right POS and the other POS row awaits its own generated clue."""
    idx = MorphologyIndex.load(_lexique())
    rows = [{"lemma": "acajou", "pos": "", "lemma_clue": "Bois exotique",
             "validation_flag": "ok", "filter_score": "0.9"}]
    out = {r["pos"]: r for r in expand_and_validate(rows, idx)}
    assert set(out) == {"nom", "adj"}
    assert out["nom"]["validation_flag"] == "ok"
    assert out["adj"]["validation_flag"] == "pos-mismatch"
