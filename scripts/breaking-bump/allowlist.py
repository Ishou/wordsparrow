"""The rollout allowlist — gates the WHOLE dispatcher.

Two admission paths: per-dep `deps:` (source libraries, one at a time) and whole
`types:` classes (non-source dep-types, matched against Renovate's `dep-type:<type>`
PR label).
"""
from __future__ import annotations

from pathlib import Path

import yaml

# Prefix of the Renovate-stamped dep-type label (e.g. `dep-type:helm-chart`).
TYPE_LABEL_PREFIX = "dep-type:"


def load_allowlist(path: str | Path) -> list[str]:
    """Load the committed allowlist YAML; returns the `deps` list (or [])."""
    data = yaml.safe_load(Path(path).read_text()) or {}
    return list(data.get("deps") or [])


def load_types(path: str | Path) -> list[str]:
    """Load the committed allowlist YAML; returns the `types` list (or [])."""
    data = yaml.safe_load(Path(path).read_text()) or {}
    return list(data.get("types") or [])


def is_allowlisted(dep: str, allowlist: list[str]) -> bool:
    """True iff `dep` is on the rollout allowlist (case-insensitive)."""
    target = dep.strip().lower()
    return any(target == entry.strip().lower() for entry in allowlist)


def is_type_allowlisted(labels: list[str], allowed_types: list[str]) -> bool:
    """True iff any `dep-type:<type>` label names a type on `allowed_types` (case-insensitive)."""
    allowed = {t.strip().lower() for t in allowed_types}
    for label in labels:
        s = label.strip().lower()
        if s.startswith(TYPE_LABEL_PREFIX) and s[len(TYPE_LABEL_PREFIX):] in allowed:
            return True
    return False
