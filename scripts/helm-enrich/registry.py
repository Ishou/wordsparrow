"""Load and query the upstream-source registry (infra/tools-upgrade-sources.yaml)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Source:
    name: str
    release_notes: str
    extra_docs: str | None = None
    priority: str | None = None


def load_registry(path: str | Path) -> dict[str, dict[str, Source]]:
    """Return {"A": {name: Source}, "B": {image: Source}}."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    out: dict[str, dict[str, Source]] = {"A": {}, "B": {}}
    for entry in data.get("modeA", []) or []:
        out["A"][entry["name"]] = Source(
            name=entry["name"],
            release_notes=entry["releaseNotes"],
            extra_docs=entry.get("extraDocs"),
            priority=entry.get("priority"),
        )
    for entry in data.get("modeB", []) or []:
        out["B"][entry["image"]] = Source(
            name=entry["image"],
            release_notes=entry["releaseNotes"],
            extra_docs=entry.get("extraDocs"),
            priority=entry.get("priority"),
        )
    return out


def lookup(reg: dict[str, dict[str, Source]], mode: str, name: str) -> Source | None:
    return reg.get(mode, {}).get(name)


def render_url(pattern: str, version: str) -> str:
    # {series} = major.minor prefix for MariaDB's series-nested doc URLs.
    series = ".".join(version.split(".")[:2])
    return pattern.replace("{series}", series).replace("{version}", version)
