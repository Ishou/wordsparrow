"""Extract bump metadata from a Renovate PR: dep/from/to + the update-type label."""
from __future__ import annotations

import re

# Renovate PR-body table row; real Renovate emits a unicode arrow (→) and the dep cell can carry extra links, with 3 or 4 columns — see the verbatim PR-#841 fixture in test_prmeta.py.
_TABLE_ROW = re.compile(
    r"\|\s*\[(?P<dep>[^\]\n]+?)\][^|\n]*\|"                         # dep cell: [name] then rest to |
    r"(?:[^|\n]*\|)+?"                                              # 1+ middle cells (Update[/Type])
    r"\s*`(?P<from>[^`\n]+?)`\s*(?:->|→)\s*`(?P<to>[^`\n]+?)`\s*\|"  # change cell: `from` (-> or →) `to`
)
_UPDATE_LABEL = re.compile(r"^update:(?P<type>major|minor|patch)$")


def parse_versions(title: str, body: str) -> tuple[str, str, str] | None:
    """Return (dep, from_ver, to_ver) from the Renovate PR body table, or None if absent."""
    match = _TABLE_ROW.search(body or "")
    if not match:
        return None
    return match.group("dep").strip(), match.group("from").strip(), match.group("to").strip()


def update_type_label(labels: list[str]) -> str | None:
    """Return 'major'|'minor'|'patch' from the `update:<type>` label, or None."""
    for label in labels:
        m = _UPDATE_LABEL.match(label.strip())
        if m:
            return m.group("type")
    return None
