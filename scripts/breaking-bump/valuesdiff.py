"""Key-path diff of two Helm default-values trees; lists are treated as leaves."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_MISSING = object()


@dataclass(frozen=True)
class KeyChange:
    path: str
    kind: str  # "added" | "removed" | "changed"
    old: Any
    new: Any
    overridden: bool = False


def flatten(tree: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten a dict to {dotted.path: leaf}. Non-dicts (incl. lists) are leaves."""
    if not isinstance(tree, dict):
        return {prefix: tree}
    out: dict[str, Any] = {}
    for key, value in tree.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        out.update(flatten(value, path))
    return out


def diff_values(old: dict, new: dict) -> list[KeyChange]:
    """Emit one KeyChange per added/removed/changed leaf. Overridden defaults False."""
    old_flat = flatten(old or {})
    new_flat = flatten(new or {})
    changes: list[KeyChange] = []
    for path in sorted(set(old_flat) | set(new_flat)):
        ov = old_flat.get(path, _MISSING)
        nv = new_flat.get(path, _MISSING)
        if ov is _MISSING:
            changes.append(KeyChange(path, "added", None, nv))
        elif nv is _MISSING:
            changes.append(KeyChange(path, "removed", ov, None))
        elif ov != nv:
            changes.append(KeyChange(path, "changed", ov, nv))
    return changes


def mark_overrides(changes: list[KeyChange], override_docs: list[dict]) -> list[KeyChange]:
    """Set overridden=True for any change whose path is pinned in an override doc."""
    pinned: set[str] = set()
    for doc in override_docs:
        pinned |= set(flatten(doc or {}))
    return [
        KeyChange(c.path, c.kind, c.old, c.new, overridden=c.path in pinned)
        for c in changes
    ]


def main(argv: list[str] | None = None) -> int:
    import argparse
    import json
    from pathlib import Path

    import yaml

    p = argparse.ArgumentParser(prog="valuesdiff")
    p.add_argument("--old", required=True)
    p.add_argument("--new", required=True)
    p.add_argument("--overrides", action="append", default=[])
    args = p.parse_args(argv)
    old = yaml.safe_load(Path(args.old).read_text(encoding="utf-8"))
    new = yaml.safe_load(Path(args.new).read_text(encoding="utf-8"))
    overrides = [yaml.safe_load(Path(o).read_text(encoding="utf-8")) for o in args.overrides]
    changes = mark_overrides(diff_values(old, new), overrides)
    print(json.dumps([
        {"path": c.path, "kind": c.kind, "old": c.old, "new": c.new, "overridden": c.overridden}
        for c in changes
    ]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
