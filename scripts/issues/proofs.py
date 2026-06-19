"""Deterministic proofs for a spec/plan body — the writer loops against these until clean."""
from __future__ import annotations

import pathlib
import re
import sys
from dataclasses import dataclass

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

# filename (directory optional) + :line; extension allowlist excludes times, versions, host:ports.
_SRC_EXT = r"ya?ml|py|kts?|tsx?|jsx?|mjs|cjs|sh|md|json|toml|ini|cfg|sql|tf|txt|lock|gradle|properties"
_CITATION = re.compile(rf"((?:[\w.\-]+/)*[\w.\-]+\.(?:{_SRC_EXT})):(\d+)")
_PLACEHOLDER = re.compile(r"\b(TODO|TBD|FIXME|XXX)\b")

# Vendored/generated trees a bare filename must not resolve into.
_SKIP_DIRS = frozenset({
    ".git", "node_modules", "dist", "build", ".gradle", "target",
    "styled-system", "__pycache__", ".venv", "coverage", ".next", "out",
})


def _log(msg: str) -> None:
    """Debug breadcrumb to stderr — never affects the proof verdict."""
    print(f"[proofs] {msg}", file=sys.stderr)


@dataclass(frozen=True)
class Problem:
    kind: str
    detail: str


def _resolve_bare(filename: str, root: pathlib.Path) -> list[pathlib.Path]:
    """Files named `filename` anywhere in the repo, skipping vendored/generated trees."""
    matches = []
    for p in root.rglob(filename):
        rel = p.relative_to(root)
        if any(part in _SKIP_DIRS for part in rel.parts):
            continue
        if p.is_file():
            matches.append(p)
    return matches


def check_citations(body: str, root: pathlib.Path = _REPO_ROOT) -> list[Problem]:
    out: list[Problem] = []
    seen = resolved = 0
    for match in _CITATION.finditer(body):
        seen += 1
        path, line = match.group(1), int(match.group(2))
        target = root / path
        if not target.is_file():
            # A bare filename (no directory) may be the agent's terse shorthand for a
            # file that exists deeper in the tree — accept it iff it resolves unambiguously.
            if "/" not in path:
                hits = _resolve_bare(path, root)
                if len(hits) == 1:
                    target = hits[0]
                    resolved += 1
                    _log(f"resolved bare citation {path}:{line} -> {target.relative_to(root)}")
                elif not hits:
                    _log(f"FABRICATED {path}:{line} — no file named {path} in the repo")
                    out.append(Problem("citation", f"{path}:{line} — file does not exist"))
                    continue
                else:
                    rels = ", ".join(str(h.relative_to(root)) for h in hits[:3])
                    _log(f"AMBIGUOUS {path}:{line} — {len(hits)} matches")
                    out.append(Problem("citation",
                                        f"{path}:{line} — ambiguous bare filename "
                                        f"({len(hits)} matches: {rels}…); use the full repo-relative path"))
                    continue
            else:
                _log(f"FABRICATED {path}:{line} — file does not exist")
                out.append(Problem("citation", f"{path}:{line} — file does not exist"))
                continue
        line_count = sum(1 for _ in target.open(encoding="utf-8", errors="replace"))
        if line > line_count:
            _log(f"BAD LINE {path}:{line} — {target.relative_to(root)} has {line_count} lines")
            out.append(Problem("citation", f"{path}:{line} — file has only {line_count} lines"))
    _log(f"citations: {seen} checked, {resolved} resolved by tree-search, {len(out)} problem(s)")
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
