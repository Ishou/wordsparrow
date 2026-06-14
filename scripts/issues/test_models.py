from __future__ import annotations

from models import Issue, Status, Priority


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
