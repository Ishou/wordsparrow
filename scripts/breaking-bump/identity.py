"""Canonical bump identity, dedup slug, and Agent D branch name."""
from __future__ import annotations

import re

_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]+")
_DOTDOT = re.compile(r"\.{2,}")


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
    """Agent D's fork branch; chore/claude- prefix passes branch-name.yml."""
    # `to` is attacker-influenced; strip one leading v (Renovate emits it), then sanitise (git forbids `..` in refs).
    v = to[1:] if to[:1] == "v" else to
    safe_to = _DOTDOT.sub(".", _safe(v)).strip(".")
    return f"chore/claude-{_safe(dep)}-v{safe_to}"
