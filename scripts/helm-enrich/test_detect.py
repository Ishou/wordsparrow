"""Unit tests for detect.build_bundle — the assembled context bundle."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import detect  # noqa: E402
from classify import Bump  # noqa: E402
from registry import Source  # noqa: E402
from valuesdiff import KeyChange  # noqa: E402


def test_build_bundle_mode_a_includes_url_and_diff():
    bump = Bump(mode="A", name="signoz", old="0.122.0", new="0.128.0")
    src = Source(name="signoz", release_notes="https://x/releases/tag/v{version}", extra_docs="https://docs")
    changes = [KeyChange("clickhouse.replicas", "changed", 1, 2, overridden=True)]
    bundle = detect.build_bundle(bump, src, changes)
    assert bundle["mode"] == "A"
    assert bundle["name"] == "signoz"
    assert bundle["releaseNotesUrl"] == "https://x/releases/tag/v0.128.0"
    assert bundle["extraDocs"] == "https://docs"
    assert bundle["sourceMissing"] is False
    assert bundle["valuesDiff"] == [
        {"path": "clickhouse.replicas", "kind": "changed", "old": 1, "new": 2, "overridden": True}
    ]


def test_build_bundle_missing_source_flags_it():
    bump = Bump(mode="A", name="orphan", old="1.0.0", new="1.1.0")
    bundle = detect.build_bundle(bump, None, [])
    assert bundle["sourceMissing"] is True
    assert bundle["releaseNotesUrl"] is None
