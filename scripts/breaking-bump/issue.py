"""Spine-issue context block (machine-readable, hidden in the body) + dedup.

Pure functions over already-fetched issue dicts; the actual `gh issue` calls live
in the workflow. Dedup is on the FULL transition `<dep>@<from>→<to>` (spec #6) so
two different 0.x bumps of the same dep never collide.
"""
from __future__ import annotations

import json
import re

from identity import identity

_BLOCK_RE = re.compile(r"<!-- breaking-bump:context\n(?P<json>.*?)\n-->", re.DOTALL)


def render_context_block(dep: str, frm: str, to: str, pr: int) -> str:
    """The machine-readable context block embedded (invisibly) in the issue body."""
    payload = json.dumps({"dep": dep, "from": frm, "to": to, "pr": pr},
                         indent=2, sort_keys=True)
    return f"<!-- breaking-bump:context\n{payload}\n-->"


def parse_context_block(body: str) -> dict | None:
    """Extract the context dict from an issue body, or None if absent/malformed."""
    match = _BLOCK_RE.search(body or "")
    if not match:
        return None
    try:
        return json.loads(match.group("json"))
    except json.JSONDecodeError:
        return None


def issue_title(dep: str, frm: str, to: str) -> str:
    """Spine-issue title; carries the dedup identity for humans and search."""
    return f"breaking-bump: {identity(dep, frm, to)}"


def find_existing(issues: list[dict], dep: str, frm: str, to: str) -> dict | None:
    """Return the open `breaking-bump` issue matching this exact transition, else
    None. Matches on the parsed context block first, then the title as a fallback."""
    want = identity(dep, frm, to)
    for item in issues:
        ctx = parse_context_block(item.get("body", ""))
        if ctx and identity(ctx.get("dep", ""), ctx.get("from", ""), ctx.get("to", "")) == want:
            return item
        if want in (item.get("title") or ""):
            return item
    return None
