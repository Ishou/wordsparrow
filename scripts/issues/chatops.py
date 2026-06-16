"""Pure ChatOps command→action mapper for the issue-dev lifecycle. No I/O."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from models import Status


class Command(str, Enum):
    APPROVE = "/approve"
    LAUNCH = "/launch"
    RESPEC = "/respec"
    REPLAN = "/replan"
    CORRECT = "/correct"
    CORRECT_PLAN = "/correct-plan"
    ANSWER = "/answer"


class Signal(str, Enum):
    WRITE_SPEC = "write_spec"
    CORRECT_SPEC = "correct_spec"
    WRITE_PLAN = "write_plan"
    CORRECT_PLAN = "correct_plan"
    DISPATCH_IMPLEMENTER = "dispatch_implementer"


@dataclass(frozen=True)
class Action:
    command: "Command | None" = None
    next_status: "Status | None" = None  # board write; None ⇒ no status change
    signal: "Signal | None" = None  # agent step to run, if any
    answer: "str | None" = None  # free-form /answer text; None unless ANSWER


_NOOP = Action()


def _parse_command(body: str) -> "tuple[Command, str] | None":
    head = body.lstrip()
    if not head.startswith("/"):
        return None
    token = head.split(None, 1)
    verb = token[0].lower()
    rest = token[1] if len(token) > 1 else ""
    for cmd in Command:
        if verb == cmd.value:
            return cmd, rest
    return None


def _parse_answer(rest: str) -> "str | None":
    # collapse to one line: multi-line answers would break a GITHUB_OUTPUT row.
    return " ".join(rest.split()) or None


def map_command(body: str, status: "Status | None") -> Action:
    """Map body + status to a board action; unknown/out-of-gate commands are no-ops."""
    parsed = _parse_command(body)
    if parsed is None:
        return _NOOP
    cmd, rest = parsed

    if cmd is Command.APPROVE:
        if status is Status.NEEDS_INPUT:
            return Action(cmd, Status.READY, Signal.WRITE_PLAN)
        if status is Status.PLAN_REVIEW:
            return Action(cmd, Status.PLANNED)
        return Action(cmd)

    if cmd is Command.LAUNCH:
        # /launch lives at planned; ready/needs_input are maintainer overrides
        if status in (Status.PLANNED, Status.READY, Status.NEEDS_INPUT):
            return Action(cmd, Status.BUILDING, Signal.DISPATCH_IMPLEMENTER)
        return Action(cmd)

    if cmd is Command.RESPEC:
        if status in (Status.IDEA, Status.NEEDS_INPUT, Status.READY,
                      Status.PLAN_REVIEW, Status.PLANNED):
            return Action(cmd, Status.IDEA, Signal.WRITE_SPEC, answer=_parse_answer(rest))
        return Action(cmd)

    if cmd is Command.REPLAN:
        # big change: regenerate the plan; only meaningful once a plan exists.
        if status in (Status.PLAN_REVIEW, Status.PLANNED):
            return Action(cmd, Status.READY, Signal.WRITE_PLAN, answer=_parse_answer(rest))
        return Action(cmd)

    if cmd is Command.CORRECT:
        # targeted in-place fix of the existing spec; no board move.
        if status in (Status.IDEA, Status.NEEDS_INPUT, Status.READY,
                      Status.PLAN_REVIEW, Status.PLANNED):
            return Action(cmd, signal=Signal.CORRECT_SPEC, answer=_parse_answer(rest))
        return Action(cmd)

    if cmd is Command.CORRECT_PLAN:
        # targeted fix of the plan; only meaningful once a plan exists.
        if status in (Status.PLAN_REVIEW, Status.PLANNED):
            return Action(cmd, signal=Signal.CORRECT_PLAN, answer=_parse_answer(rest))
        return Action(cmd)

    if cmd is Command.ANSWER:
        return Action(cmd, answer=_parse_answer(rest))

    return _NOOP
