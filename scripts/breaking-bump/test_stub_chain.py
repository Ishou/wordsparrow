"""Guard the stub fixtures against rot: they must satisfy the workflow contracts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import abparse  # noqa: E402
import loop  # noqa: E402

_FIX = Path(__file__).parent / "stub_fixtures"


def test_stub_abschema_is_contract_valid():
    doc, errors = abparse.load_schema(_FIX / "abschema.json")
    assert errors == [], errors
    # Gate A must PASS on the stub (a source was fetched), so the chain proceeds.
    assert abparse.zero_docs(doc) is False


def test_stub_abrating_passes_gate_a():
    rating = (_FIX / "abrating.txt").read_text().strip()
    assert rating in {"high", "medium"}


def test_stub_plan_is_non_empty_so_d_dispatches():
    plan = json.loads((_FIX / "plan.round1.json").read_text())
    # Non-empty (a)+(b) -> NOT the cleared early-exit -> Agent D runs.
    assert abparse.early_exit(plan) is False


def test_stub_findings_approve_round_one():
    verdict = abparse.load_verdict(_FIX / "findings.round1.json")
    assert loop.c_approved(verdict) is True
    done, reason = loop.loop_done(approved=True, identical=False, round_no=1,
                                  max_rounds=6)
    assert done and reason == "approved"
