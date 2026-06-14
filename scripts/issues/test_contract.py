from __future__ import annotations

import pytest

from memory import InMemoryTracker
from models import Priority, Status
from tracker import IssueTracker


@pytest.fixture
def tracker() -> IssueTracker:
    return InMemoryTracker()


def test_create_then_get_roundtrip(tracker: IssueTracker):
    ref = tracker.create("Title", "Body", labels=("status:idea",))
    issue = tracker.get(ref.id)
    assert issue.title == "Title"
    assert issue.body == "Body"
    assert issue.status is Status.IDEA


def test_set_status_keeps_exactly_one_status_label(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("status:idea",))
    tracker.set_status(ref.id, Status.BUILDING)
    labels = tracker.get(ref.id).labels
    assert [l for l in labels if l.startswith("status:")] == ["status:building"]


def test_set_priority_keeps_exactly_one_priority_label(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("priority:low",))
    tracker.set_priority(ref.id, Priority.HIGH)
    labels = tracker.get(ref.id).labels
    assert [l for l in labels if l.startswith("priority:")] == ["priority:high"]


def test_close_clears_status_and_marks_closed(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("status:building",))
    tracker.close(ref.id, reason="completed")
    issue = tracker.get(ref.id)
    assert issue.state == "closed"
    assert [l for l in issue.labels if l.startswith("status:")] == []


def test_list_filters_by_label_and_state(tracker: IssueTracker):
    a = tracker.create("a", "b", labels=("status:ready", "priority:high"))
    tracker.create("b", "b", labels=("status:idea",))
    ready = tracker.list(labels=("status:ready",), state="open")
    assert [i.id for i in ready] == [a.id]


def test_comments_roundtrip(tracker: IssueTracker):
    ref = tracker.create("t", "b")
    tracker.comment(ref.id, "hello")
    bodies = [c.body for c in tracker.comments(ref.id)]
    assert bodies == ["hello"]
