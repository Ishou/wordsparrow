"""Deterministic B<->C loop control: approval, identical-finding stop, cap."""
from __future__ import annotations


def c_approved(verdict: dict) -> bool:
    """True iff C's verdict approves the plan; malformed verdict is not approved."""
    return bool(verdict.get("approved") is True)


def findings_identical(prev: list[str], curr: list[str]) -> bool:
    """True iff curr == prev as a set; empty prev (round 1) is never identical."""
    if not prev:
        return False
    return set(prev) == set(curr)


def loop_done(approved: bool, identical: bool, round_no: int,
              max_rounds: int) -> tuple[bool, str]:
    """Return (done, reason); reason in {approved, stuck, cap, ""}."""
    if approved:
        return True, "approved"
    if identical:
        return True, "stuck"
    if round_no >= max_rounds:
        return True, "cap"
    return False, ""


def round_should_run(prev_approved: bool | None,
                     prev_terminated: bool | None) -> bool:
    """True if round N's B should run: round 1 always; later rounds only if unresolved."""
    if prev_approved is None and prev_terminated is None:
        return True
    return not (bool(prev_approved) or bool(prev_terminated))
