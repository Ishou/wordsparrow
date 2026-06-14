"""Domain types for the issue-tracker port. No I/O, no vendor SDKs."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


# abstract board column; adapters map to native representation (ADR-0069 amended)
class Status(str, Enum):
    IDEA = "idea"
    READY = "ready"
    BUILDING = "building"


class Priority(str, Enum):
    HIGH = "priority:high"
    MEDIUM = "priority:medium"
    LOW = "priority:low"


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
    status: "Status | None" = None  # adapter-populated from the native board column

    @property
    def priority(self) -> Priority | None:
        hit = [lbl for lbl in self.labels if lbl in PRIORITY_LABELS]
        return Priority(hit[0]) if hit else None
