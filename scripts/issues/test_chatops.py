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


def test_respec_from_plan_review_goes_idea_and_signals_spec():
    a = map_command("/respec the plan found approach b impossible", Status.PLAN_REVIEW)
    assert a == Action(Command.RESPEC, Status.IDEA, Signal.WRITE_SPEC,
                       answer="the plan found approach b impossible")


def test_respec_from_idea_still_signals_spec():
    a = map_command("/respec", Status.IDEA)
    assert a == Action(Command.RESPEC, Status.IDEA, Signal.WRITE_SPEC)


def test_replan_from_plan_review_goes_ready_and_signals_plan():
    a = map_command("/replan", Status.PLAN_REVIEW)
    assert a == Action(Command.REPLAN, Status.READY, Signal.WRITE_PLAN)


def test_replan_before_a_plan_exists_is_noop_transition():
    a = map_command("/replan", Status.READY)
    assert a.command is Command.REPLAN and a.next_status is None and a.signal is None


def test_correct_fixes_spec_in_place_without_a_board_move():
    a = map_command("/correct drop the image-digest-guard.yml citations", Status.NEEDS_INPUT)
    assert a == Action(Command.CORRECT, signal=Signal.CORRECT_SPEC,
                       answer="drop the image-digest-guard.yml citations")
    assert a.next_status is None


def test_correct_plan_targets_the_plan_only_at_plan_stages():
    a = map_command("/correct-plan fix the guard step", Status.PLAN_REVIEW)
    assert a == Action(Command.CORRECT_PLAN, signal=Signal.CORRECT_PLAN,
                       answer="fix the guard step")
    assert a.next_status is None


def test_correct_plan_before_a_plan_exists_is_noop():
    a = map_command("/correct-plan x", Status.NEEDS_INPUT)
    assert a.command is Command.CORRECT_PLAN and a.signal is None


def test_rework_is_no_longer_a_command():
    assert map_command("/rework", Status.PLAN_REVIEW) == Action()


def test_answer_records_freeform_value_no_status_change():
    a = map_command("/answer b", Status.NEEDS_INPUT)
    assert a == Action(Command.ANSWER, answer="b")
    assert a.next_status is None and a.signal is None


def test_answer_keeps_multi_word_prose_collapsed_to_one_line():
    a = map_command("/answer go with b,  include grid", Status.NEEDS_INPUT)
    assert a.answer == "go with b, include grid"


def test_answer_without_value_is_recognized_with_none_answer():
    a = map_command("/answer", Status.NEEDS_INPUT)
    assert a.command is Command.ANSWER and a.answer is None


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
