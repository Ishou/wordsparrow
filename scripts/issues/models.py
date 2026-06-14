"""Domain types for the issue-tracker port. No I/O, no vendor SDKs."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Status(str, Enum):
    IDEA = "status:idea"
    READY = "status:ready"
    BUILDING = "status:building"


class Priority(str, Enum):
    HIGH = "priority:high"
    MEDIUM = "priority:medium"
    LOW = "priority:low"


STATUS_LABELS = frozenset(s.value for s in Status)
PRIORITY_LABELS = frozenset(p.value for p in Priority)


@dataclass(frozen=True)
class IssueRef:
    id: int
    url: str


@dataclass(frozen=True)
class Comment:
    author: str
    body: str
    created_at: str


@dataclass(frozen=True)
class Issue:
    id: int
    title: str
    body: str
    labels: tuple[str, ...]
    state: str  # "open" | "closed"
    url: str = ""

    def _single(self, allowed: frozenset[str], enum: type) -> object | None:
        hit = [lbl for lbl in self.labels if lbl in allowed]
        return enum(hit[0]) if hit else None

    @property
    def status(self) -> Status | None:
        return self._single(STATUS_LABELS, Status)

    @property
    def priority(self) -> Priority | None:
        return self._single(PRIORITY_LABELS, Priority)
