"""Unit tests for routing — the deterministic dispatch/gate decisions."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import routing  # noqa: E402


def test_parse_semver_strips_prefix_and_suffix():
    assert routing.parse_semver("v0.122.0") == (0, 122, 0)
    assert routing.parse_semver("1.2.3-rc1") == (1, 2, 3)
    assert routing.parse_semver("2.10") == (2, 10, 0)
    assert routing.parse_semver("3") == (3, 0, 0)


def test_update_type_from_versions():
    assert routing.update_type("1.2.3", "2.0.0") == "major"
    assert routing.update_type("0.122.0", "0.128.0") == "minor"
    assert routing.update_type("1.2.3", "1.2.4") == "patch"


def test_dispatch_route_allowlist_gates_everything():
    # Not allowlisted -> skip even a major (zero cost, signoz-only intent).
    assert routing.dispatch_route("major", 1, on_allowlist=False) == routing.SKIP
    assert routing.dispatch_route("minor", 0, on_allowlist=False) == routing.SKIP


def test_dispatch_route_pipeline_vs_ai_gate():
    assert routing.dispatch_route("major", 1, on_allowlist=True) == routing.PIPELINE
    # On a 0.x dep ANY bump is breaking-equivalent -> pipeline (semver §4).
    assert routing.dispatch_route("minor", 0, on_allowlist=True) == routing.PIPELINE
    assert routing.dispatch_route("patch", 0, on_allowlist=True) == routing.PIPELINE
    # On a >=1.x dep, minor/patch -> the cheap AI gate.
    assert routing.dispatch_route("minor", 1, on_allowlist=True) == routing.AI_GATE
    assert routing.dispatch_route("patch", 1, on_allowlist=True) == routing.AI_GATE


def test_gate_route():
    assert routing.gate_route("green") == routing.MERGEABLE
    assert routing.gate_route("breaking") == routing.PIPELINE
    assert routing.gate_route("ambiguous") == routing.PIPELINE


def test_nodoc_route_scales_with_pipeline_eligibility():
    # Pipeline-eligible (a major, or ANY 0.x bump) + no doc -> escalate (Gate A).
    assert routing.nodoc_route("major", 1) == routing.ESCALATE
    assert routing.nodoc_route("minor", 0) == routing.ESCALATE
    assert routing.nodoc_route("patch", 0) == routing.ESCALATE
    # >=1.x minor/patch + no doc -> mergeable (semver says low-risk).
    assert routing.nodoc_route("minor", 1) == routing.MERGEABLE
    assert routing.nodoc_route("patch", 1) == routing.MERGEABLE
