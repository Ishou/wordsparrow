from __future__ import annotations

from models import Priority, Status
from tracker import IssueTracker


def test_create_then_get_roundtrip(tracker: IssueTracker):
    ref = tracker.create("Title", "Body")
    issue = tracker.get(ref.id)
    assert issue.title == "Title"
    assert issue.body == "Body"


def test_set_status_moves_to_board_column_without_labels(tracker: IssueTracker):
    ref = tracker.create("t", "b")
    tracker.set_status(ref.id, Status.BUILDING)
    issue = tracker.get(ref.id)
    assert issue.status is Status.BUILDING
    assert [l for l in issue.labels if l.startswith("status:")] == []


def test_set_priority_keeps_exactly_one_priority_label(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("priority:low",))
    tracker.set_priority(ref.id, Priority.HIGH)
    labels = tracker.get(ref.id).labels
    assert [l for l in labels if l.startswith("priority:")] == ["priority:high"]


def test_close_marks_closed(tracker: IssueTracker):
    ref = tracker.create("t", "b")
    tracker.set_status(ref.id, Status.BUILDING)
    tracker.close(ref.id, reason="completed")
    assert tracker.get(ref.id).state == "closed"


def test_list_filters_by_status(tracker: IssueTracker):
    a = tracker.create("a", "b")
    tracker.set_status(a.id, Status.READY)
    b = tracker.create("b", "b")
    tracker.set_status(b.id, Status.IDEA)
    ready = tracker.list(status=Status.READY)
    assert [i.id for i in ready] == [a.id]


def test_list_filters_by_label_and_state(tracker: IssueTracker):
    a = tracker.create("a", "b", labels=("priority:high",))
    tracker.create("b", "b", labels=("priority:low",))
    hits = tracker.list(labels=("priority:high",), state="open")
    assert [i.id for i in hits] == [a.id]


def test_comments_roundtrip(tracker: IssueTracker):
    ref = tracker.create("t", "b")
    tracker.comment(ref.id, "hello")
    bodies = [c.body for c in tracker.comments(ref.id)]
    assert bodies == ["hello"]
