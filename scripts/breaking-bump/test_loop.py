"""Unit tests for loop — the deterministic B<->C control logic."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import loop  # noqa: E402

MAX_ROUNDS = 6


def test_c_approved_true_on_approved_verdict():
    assert loop.c_approved({"approved": True, "findings": []}) is True


def test_c_approved_false_on_rejection():
    assert loop.c_approved({"approved": False, "findings": ["x"]}) is False


def test_c_approved_false_on_missing_key():
    # Malformed verdict -> not approved (fail-safe: keep looping / escalate).
    assert loop.c_approved({}) is False


def test_findings_identical_true_on_same_set():
    assert loop.findings_identical(["a", "b"], ["b", "a"]) is True


def test_findings_identical_false_on_change():
    assert loop.findings_identical(["a"], ["a", "b"]) is False


def test_findings_identical_false_on_empty_prev():
    # Round 1 has no prior findings -> never an identical-finding stop.
    assert loop.findings_identical([], ["a"]) is False


def test_loop_done_when_approved():
    done, reason = loop.loop_done(approved=True, identical=False, round_no=2,
                                  max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "approved"


def test_loop_done_when_identical_findings():
    done, reason = loop.loop_done(approved=False, identical=True, round_no=3,
                                  max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "stuck"


def test_loop_done_at_cap():
    done, reason = loop.loop_done(approved=False, identical=False,
                                  round_no=MAX_ROUNDS, max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "cap"


def test_loop_not_done_mid_run():
    done, reason = loop.loop_done(approved=False, identical=False, round_no=2,
                                  max_rounds=MAX_ROUNDS)
    assert done is False
    assert reason == ""


def test_round_should_run_round1_always():
    # Round 1 runs whenever Gate A passed; no prior C to consult.
    assert loop.round_should_run(prev_approved=None, prev_terminated=None) is True


def test_round_should_run_false_after_approval():
    assert loop.round_should_run(prev_approved=True, prev_terminated=False) is False


def test_round_should_run_false_after_termination():
    assert loop.round_should_run(prev_approved=False, prev_terminated=True) is False


def test_round_should_run_true_when_unresolved():
    assert loop.round_should_run(prev_approved=False, prev_terminated=False) is True
