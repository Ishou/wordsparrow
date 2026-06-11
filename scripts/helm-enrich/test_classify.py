"""Unit tests for classify — bump extraction from old/new file text."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import classify  # noqa: E402

CHART_OLD = """\
apiVersion: v2
name: observability
dependencies:
  - name: signoz
    version: "0.122.0"
    repository: "https://charts.signoz.io"
  - name: k8s-infra
    version: "0.15.1"
    repository: "https://charts.signoz.io"
"""

CHART_NEW = CHART_OLD.replace('version: "0.122.0"', 'version: "0.128.0"')


def test_parse_chart_bump_finds_single_changed_dep():
    bumps = classify.classify("infra/observability/Chart.yaml", CHART_OLD, CHART_NEW)
    assert bumps == [classify.Bump(mode="A", name="signoz", old="0.122.0", new="0.128.0")]


def test_parse_chart_bump_no_change_returns_empty():
    bumps = classify.classify("infra/observability/Chart.yaml", CHART_OLD, CHART_OLD)
    assert bumps == []


def test_mode_for_path():
    assert classify.mode_for_path("infra/platform/Chart.yaml") == "A"
    assert classify.mode_for_path("infra/matomo/values.yaml") == "B"
    assert classify.mode_for_path("infra/nats/values-prod.yaml") == "B"
