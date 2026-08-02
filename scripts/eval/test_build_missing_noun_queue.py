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
