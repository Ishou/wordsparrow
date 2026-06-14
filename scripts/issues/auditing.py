"""Decorator that records every mutation as an audit comment on the issue."""
from __future__ import annotations

from typing import Callable

from models import Comment, Issue, IssueRef, Priority, Status
from tracker import IssueTracker


class AuditingTracker(IssueTracker):
    def __init__(self, inner: IssueTracker, actor: str,
                 now: Callable[[], str] | None = None) -> None:
        from datetime import datetime, timezone
        self._inner = inner
        self._actor = actor
        self._now = now or (lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))

    def _audit(self, id: int, action: str, detail: str = "") -> None:
        sep = " · " if detail else ""
        self._inner.comment(id, f"🤖 {action}{sep}{detail} · actor: {self._actor} · {self._now()}")

    def get(self, id: int) -> Issue: return self._inner.get(id)
    def list(self, labels=(), state="open", status=None) -> list[Issue]: return self._inner.list(labels, state, status)
    def comments(self, id: int) -> list[Comment]: return self._inner.comments(id)

    # comment is the audit channel — not itself audited
    def comment(self, id: int, body: str) -> None: self._inner.comment(id, body)

    def create(self, title, body, labels=()) -> IssueRef:
        ref = self._inner.create(title, body, labels)
        self._audit(ref.id, "create", f"labels: {','.join(labels) or '-'}")
        return ref

    def update_body(self, id: int, body: str) -> None:
        self._inner.update_body(id, body)
        self._audit(id, "update_body")

    def add_label(self, id: int, label: str) -> None:
        self._inner.add_label(id, label)
        self._audit(id, "add_label", label)

    def remove_label(self, id: int, label: str) -> None:
        self._inner.remove_label(id, label)
        self._audit(id, "remove_label", label)

    # repo-level: no issue thread to audit
    def ensure_label(self, name: str, color: str, description: str) -> None:
        self._inner.ensure_label(name, color, description)

    def ensure_status_field(self, options: tuple[str, ...]) -> None:
        self._inner.ensure_status_field(options)

    def set_status(self, id: int, status: Status) -> None:
        before = self._inner.get(id).status
        if before == status:
            return
        self._inner.set_status(id, status)
        self._audit(id, "set_status", f"status: {before.value if before else '-'} → {status.value}")

    def set_priority(self, id: int, priority: Priority) -> None:
        before = self._inner.get(id).priority
        if before == priority:
            return
        self._inner.set_priority(id, priority)
        self._audit(id, "set_priority", f"{before.value if before else '-'} → {priority.value}")

    def close(self, id: int, reason: str = "completed") -> None:
        self._inner.close(id, reason)
        self._audit(id, "close", reason)

    # primitive required by ABC; never called directly on the decorator
    def _close(self, id: int, reason: str) -> None:
        self._inner._close(id, reason)
