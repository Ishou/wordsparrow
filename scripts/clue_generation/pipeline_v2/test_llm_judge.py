"""Tests du juge Opus committé : parse, politique GOOD-only, routing, + calibration (mock ; live si clé)."""

from __future__ import annotations

import csv
import json
import os
from collections import Counter
from pathlib import Path

import pytest

from . import llm_judge as J
from .run_pipeline import apply_ship_gate

FIXTURE = Path(__file__).parent / "calibration_fixture.csv"


def _load_fixture() -> list[dict]:
    """Charge la fixture de calibration (lemma, clue, expected_verdict, source)."""
    with FIXTURE.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _mock_call_from(expected: dict[tuple[str, str], str]) -> J.JudgeCall:
    """Mock déterministe : renvoie le verdict attendu de la fixture (jamais d'appel API)."""
    def call(lemma: str, clue: str) -> str:
        return json.dumps({"verdict": expected[(lemma, clue)], "reason": "mock"})
    return call


# --- parse + politique ---

def test_parse_verdict_good():
    v = J.parse_verdict('{"verdict": "GOOD", "reason": "sens clair"}')
    assert v.verdict == J.GOOD
    assert v.reason == "sens clair"


def test_parse_verdict_lowercase_normalised():
    assert J.parse_verdict('{"verdict": "bad"}').verdict == J.BAD


def test_parse_verdict_out_of_scale_raises():
    with pytest.raises(ValueError):
        J.parse_verdict('{"verdict": "MEH"}')


def test_ship_policy_good_only():
    assert J.JudgeVerdict(J.GOOD).ships is True
    assert J.JudgeVerdict(J.BORDERLINE).ships is False
    assert J.JudgeVerdict(J.BAD).ships is False


def test_route_mapping():
    assert J.JudgeVerdict(J.GOOD).route == J.SHIP
    assert J.JudgeVerdict(J.BORDERLINE).route == J.CURATED_REVIEW
    assert J.JudgeVerdict(J.BAD).route == J.DROP


def test_judge_clue_uses_injected_call():
    call = _mock_call_from({("TIR", "Action de viser"): J.BAD})
    assert J.judge_clue("TIR", "Action de viser", call=call).verdict == J.BAD


# --- routing du gate contre la fixture (mock) ---

def test_ship_gate_routes_fixture_good_only():
    fixture = _load_fixture()
    expected = {(r["lemma"], r["clue"]): r["expected_verdict"] for r in fixture}
    call = _mock_call_from(expected)
    rows = [{"mot": r["lemma"], "definition": r["clue"],
             "pipeline_status": "accept"} for r in fixture]

    buckets = apply_ship_gate(rows, call=call)

    def pairs(bucket):
        return {(r["mot"], r["definition"]) for r in bucket}

    def expected_pairs(verdict):
        return {(r["lemma"], r["clue"]) for r in fixture
                if r["expected_verdict"] == verdict}

    assert pairs(buckets[J.SHIP]) == expected_pairs(J.GOOD)
    assert pairs(buckets[J.CURATED_REVIEW]) == expected_pairs(J.BORDERLINE)
    assert pairs(buckets[J.DROP]) == expected_pairs(J.BAD)
    # Politique GOOD-only : chaque ligne embarquée est un GOOD.
    assert all(r["ship_verdict"] == J.GOOD for r in buckets[J.SHIP])


def test_ship_gate_skips_rejected_rows():
    call = _mock_call_from({("PAIN", "Aliment de base"): J.GOOD})
    rows = [
        {"mot": "PAIN", "definition": "Aliment de base", "pipeline_status": "accept"},
        {"mot": "X", "definition": "déjà rejeté", "pipeline_status": "reject"},
    ]
    buckets = apply_ship_gate(rows, call=call)
    shipped = {r["mot"] for r in buckets[J.SHIP]}
    assert shipped == {"PAIN"}


# --- calibration live (opérateur ; skip sans clé) ---

@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"),
                    reason="live calibration = étape opérateur (requiert ANTHROPIC_API_KEY)")
def test_live_calibration_confusion():
    fixture = _load_fixture()
    confusion: Counter = Counter()
    correct = 0
    for r in fixture:
        got = J.judge_clue(r["lemma"], r["clue"]).verdict
        exp = r["expected_verdict"]
        confusion[(exp, got)] += 1
        correct += (got == exp)
    total = len(fixture)
    print(f"\nCalibration live : {correct}/{total} exacts")
    for (exp, got), n in sorted(confusion.items()):
        print(f"  attendu={exp:10s} obtenu={got:10s}  ×{n}")
    assert correct / total >= 0.7
