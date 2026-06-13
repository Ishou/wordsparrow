"""Deterministic plan-monotonicity guard for the B'/amend loop (ADR-0068)."""
from __future__ import annotations

import json
from pathlib import Path


def load_plan(path: str | Path) -> dict:
    """Read a plan.json; missing/unreadable/invalid -> {} (never raise)."""
    try:
        doc = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return doc if isinstance(doc, dict) else {}


def entries(plan: dict) -> set[str]:
    """Union of accountable units: dispositions keys + a/b/c action strings."""
    units: set[str] = set()
    dispositions = plan.get("dispositions")
    if isinstance(dispositions, dict):
        units.update(k for k in dispositions if isinstance(k, str))
    for field in ("a", "b", "c"):
        members = plan.get(field)
        if isinstance(members, list):
            units.update(m for m in members if isinstance(m, str))
    return units


def accounted_removals(plan: dict) -> set[str]:
    """Entries B' logged as intentionally removed, each with a reason."""
    amendments = plan.get("_amendments")
    removed = amendments.get("removed") if isinstance(amendments, dict) else None
    return {
        e["entry"]
        for e in (removed or [])
        if isinstance(e, dict) and isinstance(e.get("entry"), str)
    }


def assert_monotonic(prev: dict, new: dict) -> list[str]:
    """Sorted prior entries that vanished without a recorded removal; [] = OK."""
    dropped = entries(prev) - entries(new) - accounted_removals(new)
    return sorted(dropped)
