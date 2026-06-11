"""Unit tests for registry — load, lookup, render."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import registry  # noqa: E402

REG_YAML = """\
modeA:
  - name: signoz
    repo: "https://charts.signoz.io"
    releaseNotes: "https://github.com/SigNoz/charts/releases/tag/v{version}"
    extraDocs: "https://signoz.io/docs/operate/"
modeB:
  - image: matomo
    releaseNotes: "https://matomo.org/changelog/"
    priority: high
"""


def _reg(tmp_path: Path) -> dict:
    p = tmp_path / "sources.yaml"
    p.write_text(REG_YAML, encoding="utf-8")
    return registry.load_registry(p)


def test_lookup_mode_a_by_name(tmp_path):
    src = registry.lookup(_reg(tmp_path), "A", "signoz")
    assert src.release_notes == "https://github.com/SigNoz/charts/releases/tag/v{version}"


def test_lookup_mode_b_by_image(tmp_path):
    src = registry.lookup(_reg(tmp_path), "B", "matomo")
    assert src.priority == "high"


def test_lookup_missing_returns_none(tmp_path):
    assert registry.lookup(_reg(tmp_path), "A", "nope") is None


def test_render_url_substitutes_version():
    pattern = "https://github.com/SigNoz/charts/releases/tag/v{version}"
    assert registry.render_url(pattern, "0.128.0") == "https://github.com/SigNoz/charts/releases/tag/v0.128.0"


def test_render_url_substitutes_series_major_minor():
    pattern = "https://mariadb.com/docs/release-notes/community-server/{series}/{version}"
    assert registry.render_url(pattern, "11.4.5") == "https://mariadb.com/docs/release-notes/community-server/11.4/11.4.5"
