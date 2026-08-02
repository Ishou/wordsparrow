"""Tests for build_mood_filtered_corpus.is_subjunctive_only / is_passe_simple_nonthird."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_mood_filtered_corpus import is_passe_simple_nonthird, is_subjunctive_only  # noqa: E402


def test_subjunctive_only_true_when_every_reading_is_subjunctive():
    assert is_subjunctive_only([{"simp", "3sg"}, {"spre", "1sg"}])


def test_subjunctive_only_false_when_any_reading_has_another_mood():
    assert not is_subjunctive_only([{"simp", "3sg"}, {"ipre", "3sg"}])


def test_subjunctive_only_false_for_non_verb_reading():
    assert not is_subjunctive_only([{"npr"}])


def test_subjunctive_only_false_for_empty_readings():
    assert not is_subjunctive_only([])


def test_passe_simple_nonthird_true_for_non_third_person():
    assert is_passe_simple_nonthird([{"ipsi", "1sg"}])


def test_passe_simple_nonthird_false_for_third_person():
    assert not is_passe_simple_nonthird([{"ipsi", "3sg"}])


def test_passe_simple_nonthird_false_when_another_mood_present():
    assert not is_passe_simple_nonthird([{"ipsi", "1sg"}, {"ipre", "1sg"}])


def test_passe_simple_nonthird_false_for_empty_readings():
    assert not is_passe_simple_nonthird([])


def test_murat_murat_circumflex_accent_sensitive_distinction():
    # readings_for() never accent-folds, so "murat" (npr) and "murât" (simp/3sg) stay distinct.
    murat_readings = [{"npr"}]
    murat_circumflex_readings = [{"simp", "3sg"}]

    assert not is_subjunctive_only(murat_readings)
    assert is_subjunctive_only(murat_circumflex_readings)
