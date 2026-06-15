from __future__ import annotations

import pytest

from chatops import Action, Command, Signal, map_command
from memory import InMemoryTracker
from models import Status


def test_approve_at_needs_input_goes_ready_and_signals_plan():
    a = map_command("/approve", Status.NEEDS_INPUT)
    assert a == Action(Command.APPROVE, Status.READY, Signal.WRITE_PLAN)


def test_approve_at_plan_review_goes_planned_no_signal():
    a = map_command("/approve", Status.PLAN_REVIEW)
    assert a == Action(Command.APPROVE, Status.PLANNED)
    assert a.signal is None


def test_approve_elsewhere_is_recognized_but_no_transition():
    a = map_command("/approve", Status.BUILDING)
    assert a.command is Command.APPROVE
    assert a.next_status is None and a.signal is None


@pytest.mark.parametrize("status", [Status.PLANNED, Status.READY, Status.NEEDS_INPUT])
def test_launch_moves_to_building_and_dispatches(status: Status):
    a = map_command("/launch", status)
    assert a == Action(Command.LAUNCH, Status.BUILDING, Signal.DISPATCH_IMPLEMENTER)


def test_launch_at_idea_is_noop_transition():
    a = map_command("/launch", Status.IDEA)
    assert a.command is Command.LAUNCH
    assert a.next_status is None


def test_rework_at_needs_input_goes_idea():
    assert map_command("/rework", Status.NEEDS_INPUT) == Action(Command.REWORK, Status.IDEA)


def test_rework_at_plan_review_goes_ready():
    assert map_command("/rework", Status.PLAN_REVIEW) == Action(Command.REWORK, Status.READY)


def test_answer_parses_integer_no_status_change():
    a = map_command("/answer 2", Status.NEEDS_INPUT)
    assert a == Action(Command.ANSWER, answer=2)
    assert a.next_status is None


def test_answer_without_integer_is_recognized_with_none_answer():
    a = map_command("/answer", Status.NEEDS_INPUT)
    assert a.command is Command.ANSWER and a.answer is None


def test_answer_non_numeric_is_none():
    assert map_command("/answer foo", Status.NEEDS_INPUT).answer is None


def test_unknown_command_is_noop():
    assert map_command("/frobnicate now", Status.READY) == Action()


def test_plain_comment_is_noop():
    assert map_command("looks good to me, ship it", Status.PLAN_REVIEW) == Action()


def test_bot_audit_comment_is_noop():
    assert map_command("🤖 set_status · status: ready → planned", Status.READY) == Action()


def test_command_is_case_insensitive_and_tolerates_leading_space():
    assert map_command("  /APPROVE", Status.NEEDS_INPUT).next_status is Status.READY


def test_only_first_token_decides_command():
    # a slash command must lead; embedded "/approve" in prose does not fire
    assert map_command("please do not /approve yet", Status.NEEDS_INPUT) == Action()


def test_mapper_output_drives_a_real_tracker_status_write():
    tracker = InMemoryTracker()
    ref = tracker.create("T", "B")
    tracker.set_status(ref.id, Status.PLAN_REVIEW)
    action = map_command("/approve", tracker.get(ref.id).status)
    if action.next_status is not None:
        tracker.set_status(ref.id, action.next_status)
    assert tracker.get(ref.id).status is Status.PLANNED
