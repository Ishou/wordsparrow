"""Deterministic proofs for a spec/plan body — the writer loops against these until clean."""
from __future__ import annotations

import pathlib
import re
from dataclasses import dataclass

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

# the :line suffix is what makes a citation verifiable and distinct from a proposed new file.
_CITATION = re.compile(r"((?:[\w.\-]+/)+[\w.\-]+\.[A-Za-z0-9]+):(\d+)")
_PLACEHOLDER = re.compile(r"\b(TODO|TBD|FIXME|XXX)\b")


@dataclass(frozen=True)
class Problem:
    kind: str
    detail: str


def check_citations(body: str, root: pathlib.Path = _REPO_ROOT) -> list[Problem]:
    out: list[Problem] = []
    for match in _CITATION.finditer(body):
        path, line = match.group(1), int(match.group(2))
        target = root / path
        if not target.is_file():
            out.append(Problem("citation", f"{path}:{line} — file does not exist"))
            continue
        line_count = sum(1 for _ in target.open(encoding="utf-8", errors="replace"))
        if line > line_count:
            out.append(Problem("citation", f"{path}:{line} — file has only {line_count} lines"))
    return out


def check_placeholders(body: str, root: pathlib.Path = _REPO_ROOT) -> list[Problem]:
    return [Problem("placeholder", f"left-in marker '{m.group(1)}'")
            for m in _PLACEHOLDER.finditer(body)]


_CHECKS = (check_citations, check_placeholders)


def run_all(body: str, root: pathlib.Path = _REPO_ROOT) -> list[Problem]:
    out: list[Problem] = []
    for check in _CHECKS:
        out.extend(check(body, root))
    return out
