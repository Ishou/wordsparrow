"""Fail when a pinned image `digest:` no longer matches its `tag:`.

Infra images deploy by digest — the `digest:` is what actually gets pulled, so a
`tag:` bump that leaves a stale digest is a silent no-op (this is exactly how the
nats-box 0.19.7 bump shipped nothing). This guard merges each chart's
values.yaml + values-prod.yaml the way helm does, finds every image block that
pins a non-empty digest, and verifies that digest equals `crane digest
<repository>:<tag>`. An empty digest is skipped — those are resolved at deploy time.
"""
from __future__ import annotations

import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Callable

import yaml


def deep_merge(base: object, override: object) -> object:
    """helm-style deep merge: dicts merge recursively, override wins on leaves."""
    if isinstance(base, dict) and isinstance(override, dict):
        merged = dict(base)
        for key, value in override.items():
            merged[key] = deep_merge(base.get(key), value) if key in base else value
        return merged
    return override


def find_pinned_images(node: object, path: str = "") -> Iterator[tuple[str, str, str, str]]:
    """Yield (path, repository, tag, digest) for every block pinning a non-empty digest."""
    if isinstance(node, dict):
        repo, tag, digest = node.get("repository"), node.get("tag"), node.get("digest")
        if (
            isinstance(repo, str)
            and isinstance(tag, (str, int, float))
            and isinstance(digest, str)
            and digest.strip()
        ):
            yield path or "<root>", repo, str(tag), digest.strip()
        for key, value in node.items():
            yield from find_pinned_images(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from find_pinned_images(value, f"{path}[{index}]")


def merged_chart_values(chart_dir: Path) -> dict:
    """Merge values.yaml with an optional values-prod.yaml the way the deploy does."""
    values = yaml.safe_load((chart_dir / "values.yaml").read_text()) or {}
    prod = chart_dir / "values-prod.yaml"
    if prod.exists():
        values = deep_merge(values, yaml.safe_load(prod.read_text()) or {})
    return values  # type: ignore[return-value]


def chart_dirs(roots: list[Path]) -> list[Path]:
    """Every directory under the roots that holds a values.yaml."""
    seen = {f.parent for root in roots for f in root.rglob("values.yaml")}
    return sorted(seen)


def crane_digest(image: str) -> str:
    """Resolve an image reference to its registry (OCI image-index) digest."""
    proc = subprocess.run(
        ["crane", "digest", image], capture_output=True, text=True, check=True
    )
    return proc.stdout.strip()


def check(
    roots: list[Path], resolve: Callable[[str], str] = crane_digest
) -> list[str]:
    """Return a list of human-readable mismatch messages (empty == all pins fresh)."""
    problems: list[str] = []
    for chart in chart_dirs(roots):
        for path, repo, tag, pinned in find_pinned_images(merged_chart_values(chart)):
            image = f"{repo}:{tag}"
            try:
                actual = resolve(image)
            except subprocess.CalledProcessError as exc:
                problems.append(f"{chart}/{path}: could not resolve {image}: {exc.stderr.strip()}")
                continue
            if actual != pinned:
                problems.append(
                    f"{chart} ({path}): {image} pins digest {pinned} but the registry "
                    f"digest is {actual} — bump the digest to match the tag (or the tag "
                    f"is wrong)."
                )
    return problems


def main(argv: list[str]) -> int:
    roots = [Path(a) for a in argv[1:]] or [Path("infra")]
    problems = check(roots)
    if problems:
        print("Image tag/digest mismatch — a tag bump left a stale pinned digest:\n")
        for problem in problems:
            print(f"  ✗ {problem}")
        return 1
    print("All pinned image digests match their tags.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
