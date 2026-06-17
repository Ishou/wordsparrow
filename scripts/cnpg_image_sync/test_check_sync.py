"""Unit tests for the CNPG image sync guard (no git/network needed)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parent))

import check_sync as guard  # noqa: E402

IMAGE = "ghcr.io/cloudnative-pg/postgresql:18.4-system-bookworm@sha256:abc123"
OTHER_IMAGE = "ghcr.io/cloudnative-pg/postgresql:18.1-system-bookworm@sha256:old456"


def _yaml_for(path: str, image: str) -> str:
    """Return the minimal YAML that places `image` at the expected key path."""
    if "grid" in path:
        return yaml.dump({"postgres": {"cluster": {"imageName": image}}})
    if "db-chart" in path:
        return yaml.dump({"cluster": {"imageName": image}})
    return yaml.dump({"database": {"waitImage": image}})


def _make_reader(overrides: dict[str, str] | None = None) -> guard.Reader:
    overrides = overrides or {}

    def reader(path: str) -> str:
        return overrides.get(path, _yaml_for(path, IMAGE))

    return reader


def test_all_same():
    assert guard.check(reader=_make_reader()) == []


def test_imagename_diverged():
    path = "game/api/deploy/db-chart/values.yaml"
    reader = _make_reader({path: yaml.dump({"cluster": {"imageName": OTHER_IMAGE}})})
    problems = guard.check(reader=reader)
    assert problems
    assert any(path in p for p in problems)


def test_waitimage_diverged():
    path = "identity/api/deploy/chart/values.yaml"
    reader = _make_reader({path: yaml.dump({"database": {"waitImage": OTHER_IMAGE}})})
    problems = guard.check(reader=reader)
    assert problems
    assert any(path in p for p in problems)


def test_missing_key():
    path = "game/api/deploy/db-chart/values.yaml"
    reader = _make_reader({path: yaml.dump({"cluster": {}})})
    with pytest.raises(SystemExit) as exc_info:
        guard.check(reader=reader)
    assert path in str(exc_info.value)


def test_three_level_path():
    # grid is the only context with a 3-level key (postgres.cluster.imageName)
    path = "grid/api/deploy/chart/values.yaml"
    reader = _make_reader({path: yaml.dump({"postgres": {"cluster": {"imageName": IMAGE}}})})
    assert guard.check(reader=reader) == []
