"""Pure ChatOps command→action mapper for the issue-dev lifecycle. No I/O.

Maps an OWNER comment body + the issue's current Status to a recognized slash
command and the resulting board action, encoding the two-gate rules (ADR-0069).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from models import Status


class Command(str, Enum):
    APPROVE = "/approve"
    LAUNCH = "/launch"
    REWORK = "/rework"
    ANSWER = "/answer"


class Signal(str, Enum):
    WRITE_PLAN = "write_plan"
    DISPATCH_IMPLEMENTER = "dispatch_implementer"


@dataclass(frozen=True)
class Action:
    command: "Command | None" = None
    next_status: "Status | None" = None  # board write; None ⇒ no status change
    signal: "Signal | None" = None  # agent step to run, if any
    answer: "int | None" = None  # parsed /answer <n>; None unless ANSWER


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


def _parse_answer(rest: str) -> "int | None":
    head = rest.strip().split(None, 1)[0] if rest.strip() else ""
    try:
        return int(head)
    except ValueError:
        return None


def map_command(body: str, status: "Status | None") -> Action:
    """Recognize a command in `body` at `status` and return the resulting Action.

    Unknown commands, malformed `/answer`, or out-of-gate transitions are no-ops.
    """
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

    if cmd is Command.REWORK:
        if status is Status.NEEDS_INPUT:
            return Action(cmd, Status.IDEA)
        if status is Status.PLAN_REVIEW:
            return Action(cmd, Status.READY)
        return Action(cmd)

    if cmd is Command.ANSWER:
        return Action(cmd, answer=_parse_answer(rest))

    return _NOOP
