from __future__ import annotations

from auditing import AuditingTracker
from memory import InMemoryTracker
from models import Status


def _audit_comments(inner, id):
    return [c.body for c in inner.comments(id) if c.body.startswith("🤖")]


def test_set_status_emits_one_audit_comment_with_transition():
    inner = InMemoryTracker()
    audited = AuditingTracker(inner, actor="run-1", now=lambda: "2026-06-14T11:42Z")
    ref = audited.create("t", "b")
    audited.set_status(ref.id, Status.IDEA)
    audited.set_status(ref.id, Status.BUILDING)
    audits = _audit_comments(inner, ref.id)
    assert any("status: idea → building" in a for a in audits)
    assert sum("set_status" in a for a in audits) == 2


def test_set_status_noop_when_unchanged_emits_no_audit():
    inner = InMemoryTracker()
    audited = AuditingTracker(inner, actor="run-1", now=lambda: "t")
    ref = audited.create("t", "b")
    audited.set_status(ref.id, Status.IDEA)   # real transition: - → idea
    audited.set_status(ref.id, Status.IDEA)   # no-op: idea → idea, must not audit
    audits = _audit_comments(inner, ref.id)
    assert sum("set_status" in a for a in audits) == 1


def test_create_emits_audit_and_comment_is_not_audited():
    inner = InMemoryTracker()
    audited = AuditingTracker(inner, actor="run-1", now=lambda: "t")
    ref = audited.create("t", "b")
    audited.comment(ref.id, "human-facing note")
    audits = _audit_comments(inner, ref.id)
    assert len(audits) == 1  # the create audit only; comment() is not audited
    assert "create" in audits[0]
