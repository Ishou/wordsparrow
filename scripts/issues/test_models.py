from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from models import Issue, Priority, Status
from models import PRIORITY_LABELS


@given(st.lists(st.sampled_from(sorted(PRIORITY_LABELS | {"other"}))))
def test_priority_always_valid(labels: list[str]) -> None:
    issue = Issue(id=1, title="t", body="b", labels=tuple(labels), state="open")
    assert issue.priority is None or issue.priority in Priority


def test_priority_derived_from_labels():
    issue = Issue(
        id=7, title="t", body="b",
        labels=("priority:high", "ai-driven"),
        state="open", url="u",
    )
    assert issue.priority is Priority.HIGH


def test_missing_priority_is_none():
    issue = Issue(id=7, title="t", body="b", labels=("ai-driven",), state="open")
    assert issue.priority is None


def test_status_is_an_adapter_populated_field_not_a_label():
    assert Status.BUILDING.value == "building"  # abstract, no "status:" prefix
    assert Issue(id=1, title="t", body="b", labels=(), state="open").status is None
    issue = Issue(id=7, title="t", body="b", labels=(), state="open", status=Status.READY)
    assert issue.status is Status.READY
