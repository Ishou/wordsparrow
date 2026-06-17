"""Fail when CNPG postgres image refs diverge across chart pairs."""
from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

import yaml

Reader = Callable[[str], str]

# waitImage duplication alongside cluster.imageName is deliberate — see each values.yaml.
SOURCES: list[tuple[str, tuple[str, ...]]] = [
    ("grid/api/deploy/chart/values.yaml",        ("postgres", "cluster", "imageName")),
    ("game/api/deploy/db-chart/values.yaml",     ("cluster", "imageName")),
    ("identity/api/deploy/db-chart/values.yaml", ("cluster", "imageName")),
    ("survey/api/deploy/db-chart/values.yaml",   ("cluster", "imageName")),
    ("game/api/deploy/chart/values.yaml",        ("database", "waitImage")),
    ("identity/api/deploy/chart/values.yaml",    ("database", "waitImage")),
    ("survey/api/deploy/chart/values.yaml",      ("database", "waitImage")),
]


def _read_file(path: str) -> str:
    return Path(path).read_text()


def _extract(path: str, key_path: tuple[str, ...], reader: Reader) -> str:
    node: object = yaml.safe_load(reader(path))
    for key in key_path:
        if not isinstance(node, dict) or key not in node:
            sys.exit(
                f"ERROR: {path}: missing key '{key}' in path {'.'.join(key_path)}"
            )
        node = node[key]  # type: ignore[index]
    return str(node)


def check(
    sources: list[tuple[str, tuple[str, ...]]] = SOURCES,
    reader: Reader = _read_file,
) -> list[str]:
    """Return divergence messages; calls sys.exit on a missing key (names the file)."""
    values = [(path, _extract(path, key_path, reader)) for path, key_path in sources]
    ref_path, ref_value = values[0]
    return [
        f"{path}: {value!r} (expected {ref_value!r} from {ref_path})"
        for path, value in values[1:]
        if value != ref_value
    ]


def main() -> int:
    problems = check()
    if problems:
        print("CNPG image refs diverge — all 7 must pin the same tag+digest:\n")
        for problem in problems:
            print(f"  ✗ {problem}")
        return 1
    print("All 7 CNPG image refs are in sync.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
