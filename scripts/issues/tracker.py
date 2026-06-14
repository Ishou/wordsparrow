"""IssueTracker port — invariants in concrete methods; no vendor SDK imports."""
from __future__ import annotations

from abc import ABC, abstractmethod

from models import (
    PRIORITY_LABELS,
    Comment,
    Issue,
    IssueRef,
    Priority,
    Status,
)


class IssueTracker(ABC):
    @abstractmethod
    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef: ...

    @abstractmethod
    def get(self, id: int) -> Issue: ...

    @abstractmethod
    def list(
        self, labels: tuple[str, ...] = (), state: str = "open",
        status: "Status | None" = None,
    ) -> list[Issue]: ...

    @abstractmethod
    def update_body(self, id: int, body: str) -> None: ...

    @abstractmethod
    def comment(self, id: int, body: str) -> None: ...

    @abstractmethod
    def comments(self, id: int) -> list[Comment]: ...

    @abstractmethod
    def add_label(self, id: int, label: str) -> None: ...

    @abstractmethod
    def remove_label(self, id: int, label: str) -> None: ...

    @abstractmethod
    def ensure_label(self, name: str, color: str, description: str) -> None: ...

    # status is adapter-native (board column), so set/ensure are abstract
    @abstractmethod
    def set_status(self, id: int, status: Status) -> None: ...

    @abstractmethod
    def ensure_status_field(self, options: tuple[str, ...]) -> None: ...

    @abstractmethod
    def _close(self, id: int, reason: str) -> None: ...

    # priority stays label-driven; invariant enforced once here for every adapter
    def _swap(self, id: int, target: str, family: frozenset[str]) -> None:
        labels = self.get(id).labels
        for lbl in labels:
            if lbl in family and lbl != target:
                self.remove_label(id, lbl)
        if target not in labels:
            self.add_label(id, target)

    def set_priority(self, id: int, priority: Priority) -> None:
        self._swap(id, priority.value, PRIORITY_LABELS)

    def close(self, id: int, reason: str = "completed") -> None:
        self._close(id, reason)
