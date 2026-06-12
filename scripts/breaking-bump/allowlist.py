"""The rollout allowlist — gates the WHOLE dispatcher (signoz-only first)."""
from __future__ import annotations

from pathlib import Path

import yaml


def load_allowlist(path: str | Path) -> list[str]:
    """Load the committed allowlist YAML; returns the `deps` list (or [])."""
    data = yaml.safe_load(Path(path).read_text()) or {}
    return list(data.get("deps") or [])


def is_allowlisted(dep: str, allowlist: list[str]) -> bool:
    """True iff `dep` is on the rollout allowlist (case-insensitive)."""
    target = dep.strip().lower()
    return any(target == entry.strip().lower() for entry in allowlist)
