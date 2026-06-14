"""InMemoryTracker-specific tests — not part of the contract suite."""
from __future__ import annotations

from memory import InMemoryTracker


def test_ensure_label_is_idempotent_create_or_update():
    tracker = InMemoryTracker()
    tracker.ensure_label("status:ready", "0E8A16", "first")
    tracker.ensure_label("status:ready", "AABBCC", "second")
    defs = tracker.label_definitions()
    assert defs["status:ready"] == ("AABBCC", "second")
    assert sum(1 for n in defs if n == "status:ready") == 1
