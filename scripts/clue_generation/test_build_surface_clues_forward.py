"""Forward-inflation guard: a homograph surface must emit one row per clued
(lemma, pos), not a single freq/POS winner. `lie` = noun (dregs) + verb
(lier) must ship BOTH senses, each keeping its own lemma so the grid's
same-lemma dedup can tell `lie`(verb, lier) apart from the noun.

Skips gracefully without the grammalecte lexique, mirroring
scripts/eval/test_runtime_csv_agreement.py's _lexique() pattern.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from build_surface_clues import build_surface_rows, lemma_pos_freq  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

_DEFAULT_LEX = Path(os.path.expanduser(
    "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


def _corpus() -> dict[tuple[str, str], dict]:
    def entry(lemma: str, pos: str, clue: str) -> dict:
        return {
            "lemma": lemma, "pos": pos, "lemma_clue": clue,
            "validation_flag": "ok", "filter_score": "0.9",
        }
    return {
        ("lier", "verbe"): [entry("lier", "verbe", "Attacher")],
        ("lie", "nom"): [entry("lie", "nom", "Dépôt du vin")],
        ("are", "nom"): [entry("are", "nom", "Unité de surface")],
    }


def test_homograph_surface_emits_both_senses() -> None:
    lex = _lexique()
    if lex is None:
        return  # lexique absent — nothing to guard.
    index = MorphologyIndex.load(lex)
    freq = lemma_pos_freq(lex)
    corpus = _corpus()

    rows = build_surface_rows("lie", corpus, index, freq)
    pairs = {(r["lemma"], r["pos"]) for r in rows}
    assert pairs == {("lier", "verbe"), ("lie", "nom")}, pairs

    # The noun sense is copied verbatim (surface == lemma), the verb sense is
    # inflected off the infinitive `lier` — each keeps its own lemma.
    by_pos = {r["pos"]: r for r in rows}
    assert by_pos["nom"]["lemma"] == "lie"
    assert by_pos["nom"]["clue"] == "Dépôt du vin"
    assert by_pos["verbe"]["lemma"] == "lier"


def test_pure_verb_surface_keeps_verb_lemma() -> None:
    lex = _lexique()
    if lex is None:
        return
    index = MorphologyIndex.load(lex)
    freq = lemma_pos_freq(lex)
    corpus = _corpus()

    rows = build_surface_rows("lia", corpus, index, freq)
    assert len(rows) == 1, rows
    assert rows[0]["lemma"] == "lier"


def test_ppas_surface_uses_ppas_gold_not_verb_clue() -> None:
    lex = _lexique()
    if lex is None:
        return
    index = MorphologyIndex.load(lex)
    freq = lemma_pos_freq(lex)
    corpus = _corpus()
    corpus[("lier", "participe_passe")] = [{
        "lemma": "lier", "pos": "participe_passe", "lemma_clue": "Noué serré",
        "validation_flag": "ok", "filter_score": "0.9",
    }]
    rows = build_surface_rows("liée", corpus, index, freq)
    verb = [r for r in rows if r["lemma"] == "lier"]
    assert verb, rows
    # a ppas surface is clued from the participe_passe gold, never the finite verb clue
    assert verb[0]["source_clue"] == "Noué serré", verb
    assert verb[0]["pos"] == "verbe", verb  # shipped under the existing verbe schema


def test_ppas_surface_without_ppas_gold_drops() -> None:
    lex = _lexique()
    if lex is None:
        return
    index = MorphologyIndex.load(lex)
    freq = lemma_pos_freq(lex)
    corpus = _corpus()  # only ("lier","verbe") -> "Attacher"; no participe_passe gold
    rows = build_surface_rows("liée", corpus, index, freq)
    # the finite verb clue is NOT inflated onto a participle surface
    assert not [r for r in rows if r["lemma"] == "lier"], rows
