from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from models import Issue, Priority, Status
from models import PRIORITY_LABELS, STATUS_LABELS


@given(st.lists(st.sampled_from(sorted(STATUS_LABELS | PRIORITY_LABELS | {"other"}))))
def test_status_and_priority_always_valid(labels: list[str]) -> None:
    issue = Issue(id=1, title="t", body="b", labels=tuple(labels), state="open")
    assert issue.status is None or issue.status in Status
    assert issue.priority is None or issue.priority in Priority


def test_status_and_priority_derived_from_labels():
    issue = Issue(
        id=7, title="t", body="b",
        labels=("status:ready", "priority:high", "ai-driven"),
        state="open", url="u",
    )
    assert issue.status is Status.READY
    assert issue.priority is Priority.HIGH


def test_missing_status_and_priority_are_none():
    issue = Issue(id=7, title="t", body="b", labels=("ai-driven",), state="open")
    assert issue.status is None
    assert issue.priority is None
