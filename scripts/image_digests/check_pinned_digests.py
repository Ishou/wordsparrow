"""Fail when an image tag: bumps but its pinned digest: does not."""
from __future__ import annotations

import subprocess
import sys
from collections.abc import Callable, Iterator
from pathlib import Path

import yaml

Reader = Callable[[str], "str | None"]


def deep_merge(base: object, override: object) -> object:
    """helm-style deep merge: dicts merge recursively, override wins on leaves."""
    if isinstance(base, dict) and isinstance(override, dict):
        merged = dict(base)
        for key, value in override.items():
            merged[key] = deep_merge(base.get(key), value) if key in base else value
        return merged
    return override


def find_images(node: object, path: str = "") -> Iterator[tuple[str, str, str, str]]:
    """Yield (path, repository, tag, digest) for every image block with repository+tag."""
    if isinstance(node, dict):
        repo, tag = node.get("repository"), node.get("tag")
        if isinstance(repo, str) and isinstance(tag, (str, int, float)):
            digest = node.get("digest")
            yield (
                path or "<root>",
                repo,
                str(tag),
                digest.strip() if isinstance(digest, str) else "",
            )
        for key, value in node.items():
            yield from find_images(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from find_images(value, f"{path}[{index}]")


def merged_values(reader: Reader, chart_rel: str) -> dict | None:
    """Merge a chart's values.yaml + optional values-prod.yaml via `reader`; None if no base."""
    base_text = reader(f"{chart_rel}/values.yaml")
    if base_text is None:
        return None
    values = yaml.safe_load(base_text) or {}
    prod_text = reader(f"{chart_rel}/values-prod.yaml")
    if prod_text is not None:
        values = deep_merge(values, yaml.safe_load(prod_text) or {})
    return values  # type: ignore[return-value]


def diff_problems(chart_rel: str, base: dict, head: dict) -> list[str]:
    """Flag images whose tag changed but whose non-empty digest did not (the no-op)."""
    base_images = {p: (repo, tag, dig) for p, repo, tag, dig in find_images(base)}
    problems: list[str] = []
    for path, repo, tag, digest in find_images(head):
        if path not in base_images:
            continue
        _, base_tag, base_digest = base_images[path]
        if tag != base_tag and digest and digest == base_digest:
            problems.append(
                f"{chart_rel} ({path}): {repo} tag {base_tag} -> {tag} but its pinned "
                f"digest is unchanged ({digest[:23]}…) — bump the digest to match the new "
                f"tag, or this deploys the old image (silent no-op)."
            )
    return problems


def _git_show(ref: str, path: str) -> str | None:
    result = subprocess.run(
        ["git", "show", f"{ref}:{path}"], capture_output=True, text=True
    )
    return result.stdout if result.returncode == 0 else None


def _working_tree(path: str) -> str | None:
    p = Path(path)
    return p.read_text() if p.exists() else None


def chart_rels(roots: list[str]) -> list[str]:
    """Relative dirs (from repo root) holding a values.yaml in the working tree."""
    return sorted({str(f.parent) for root in roots for f in Path(root).rglob("values.yaml")})


def check(
    base_ref: str,
    roots: list[str],
    head_reader: Reader = _working_tree,
    base_reader: Reader | None = None,
) -> list[str]:
    """Return mismatch messages comparing the working tree against `base_ref`."""
    reader = base_reader or (lambda path: _git_show(base_ref, path))
    problems: list[str] = []
    for chart in chart_rels(roots):
        head = merged_values(head_reader, chart)
        base = merged_values(reader, chart)
        if head is None or base is None:  # new or deleted chart — nothing to diff
            continue
        problems.extend(diff_problems(chart, base, head))
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: check_pinned_digests.py <base-ref> [roots...]", file=sys.stderr)
        return 2
    base_ref, roots = argv[1], argv[2:] or ["infra"]
    problems = check(base_ref, roots)
    if problems:
        print("Image tag bumped without updating its pinned digest (silent no-op):\n")
        for problem in problems:
            print(f"  ✗ {problem}")
        return 1
    print("No tag-without-digest bumps detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
