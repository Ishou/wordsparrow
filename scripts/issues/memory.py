"""In-memory IssueTracker for offline tests. Real implementation, not a mock."""
from __future__ import annotations

from dataclasses import replace

from models import Comment, Issue, IssueRef
from tracker import IssueTracker


class InMemoryTracker(IssueTracker):
    def __init__(self) -> None:
        self._issues: dict[int, Issue] = {}
        self._comments: dict[int, list[Comment]] = {}
        self._seq = 0

    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef:
        self._seq += 1
        id_ = self._seq
        self._issues[id_] = Issue(
            id=id_, title=title, body=body, labels=tuple(labels),
            state="open", url=f"memory://issue/{id_}",
        )
        self._comments[id_] = []
        return IssueRef(id=id_, url=self._issues[id_].url)

    def get(self, id: int) -> Issue:
        return self._issues[id]

    def list(self, labels: tuple[str, ...] = (), state: str = "open") -> list[Issue]:
        want = set(labels)
        return [
            i for i in self._issues.values()
            if (state == "all" or i.state == state) and want.issubset(set(i.labels))
        ]

    def update_body(self, id: int, body: str) -> None:
        self._issues[id] = replace(self._issues[id], body=body)

    def comment(self, id: int, body: str) -> None:
        self._comments[id].append(Comment(author="fake", body=body, created_at="t"))

    def comments(self, id: int) -> list[Comment]:
        return list(self._comments[id])

    def add_label(self, id: int, label: str) -> None:
        issue = self._issues[id]
        if label not in issue.labels:
            self._issues[id] = replace(issue, labels=issue.labels + (label,))

    def remove_label(self, id: int, label: str) -> None:
        issue = self._issues[id]
        self._issues[id] = replace(issue, labels=tuple(l for l in issue.labels if l != label))

    def _close(self, id: int, reason: str) -> None:
        self._issues[id] = replace(self._issues[id], state="closed")
