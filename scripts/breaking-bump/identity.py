"""Dedup identity + naming for a bump.

The canonical identity is the full version transition `<dep>@<from>→<to>` (NEVER
dep or dep+major — that would merge two different 0.x bumps, spec #6). The slug is
its ASCII-safe form, used for concurrency-group names and branches.
"""
from __future__ import annotations

import re

_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]+")


def _safe(text: str) -> str:
    """Collapse any run of unsafe characters to a single '-', trim, lowercase."""
    return _UNSAFE.sub("-", text).strip("-").lower()


def identity(dep: str, frm: str, to: str) -> str:
    """Human-readable dedup identity; appears in the spine-issue title."""
    return f"{dep}@{frm}→{to}"


def slug(dep: str, frm: str, to: str) -> str:
    """ASCII-safe slug for concurrency groups: `<dep>-<from>-<to>` sanitised."""
    return _safe(f"{dep}-{frm}-{to}")


def claude_branch(dep: str, to: str) -> str:
    """D's fork branch name: `claude/<dep>-v<to>` (dep sanitised, version kept whole
    for uniqueness — a 0.x major would make a bare `vN` useless)."""
    return f"claude/{_safe(dep)}-v{to}"
