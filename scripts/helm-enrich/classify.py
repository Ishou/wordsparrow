"""Classify a Renovate PR bump (Mode A: Chart.yaml dep; Mode B: image tag)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

import yaml

_VERSION_RE = re.compile(r"^v?(?P<ver>\d+(?:\.\d+){0,2})(?P<suffix>-.+)?$")


@dataclass(frozen=True)
class Bump:
    mode: str  # "A" (subchart dep) or "B" (image tag)
    name: str  # chart dependency name, or image repository
    old: str   # old version, suffix stripped
    new: str   # new version, suffix stripped


def strip_suffix(tag: str) -> str:
    """`5.2.1-apache` -> `5.2.1`, `v0.128.0` -> `0.128.0`, `2.10-alpine` -> `2.10`."""
    cleaned = tag.strip().strip('"').strip("'")
    m = _VERSION_RE.match(cleaned)
    return m.group("ver") if m else cleaned


def mode_for_path(path: str) -> str:
    """Chart.yaml -> Mode A; any values*.yaml -> Mode B."""
    return "A" if os.path.basename(path) == "Chart.yaml" else "B"


def parse_chart_bump(old: dict, new: dict) -> list[Bump]:
    """Compare two parsed Chart.yaml docs; emit a Bump per changed dependency version."""
    old_versions = {d["name"]: str(d["version"]) for d in (old or {}).get("dependencies", [])}
    bumps: list[Bump] = []
    for dep in (new or {}).get("dependencies", []):
        name = dep["name"]
        new_v = str(dep["version"])
        old_v = old_versions.get(name)
        if old_v is not None and old_v != new_v:
            bumps.append(Bump(mode="A", name=name, old=strip_suffix(old_v), new=strip_suffix(new_v)))
    return bumps


def _walk_image_blocks(tree, acc: dict[str, str]) -> None:
    """Collect {repository: tag} for every dict carrying both keys."""
    if not isinstance(tree, dict):
        return
    if "repository" in tree and "tag" in tree:
        acc[str(tree["repository"])] = str(tree["tag"])
    for value in tree.values():
        _walk_image_blocks(value, acc)


def parse_image_bump(old: dict, new: dict) -> list[Bump]:
    """Compare two parsed values docs; emit a Bump per changed image tag."""
    old_imgs: dict[str, str] = {}
    new_imgs: dict[str, str] = {}
    _walk_image_blocks(old or {}, old_imgs)
    _walk_image_blocks(new or {}, new_imgs)
    bumps: list[Bump] = []
    for repo, new_tag in new_imgs.items():
        old_tag = old_imgs.get(repo)
        if old_tag is not None and old_tag != new_tag:
            bumps.append(Bump(mode="B", name=repo, old=strip_suffix(old_tag), new=strip_suffix(new_tag)))
    return bumps


def classify(path: str, old_text: str, new_text: str) -> list[Bump]:
    """Dispatch on path; return the bumped units (expected: exactly one)."""
    mode = mode_for_path(path)
    if mode == "A":
        return parse_chart_bump(yaml.safe_load(old_text), yaml.safe_load(new_text))
    return parse_image_bump(yaml.safe_load(old_text), yaml.safe_load(new_text))
