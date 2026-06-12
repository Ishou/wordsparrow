"""Unit tests for identity — dedup identity, slug, and claude branch naming."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import identity  # noqa: E402


def test_identity_is_full_transition():
    assert identity.identity("signoz", "0.122.0", "0.128.0") == "signoz@0.122.0→0.128.0"


def test_slug_is_ascii_safe_and_lowercased():
    assert identity.slug("signoz", "0.122.0", "0.128.0") == "signoz-0.122.0-0.128.0"
    # Scoped npm package names sanitise to a safe slug.
    assert identity.slug("@scope/pkg", "1.0.0", "2.0.0") == "scope-pkg-1.0.0-2.0.0"


def test_slug_collapses_unsafe_runs():
    assert identity.slug("a//b", "1.0", "2.0") == "a-b-1.0-2.0"


def test_two_different_0x_bumps_have_distinct_identity():
    # The dedup MUST distinguish 0.122->0.128 from 0.128->0.130 (same major 0).
    a = identity.identity("signoz", "0.122.0", "0.128.0")
    b = identity.identity("signoz", "0.128.0", "0.130.0")
    assert a != b
    assert identity.slug("signoz", "0.122.0", "0.128.0") != identity.slug("signoz", "0.128.0", "0.130.0")


def test_claude_branch_name():
    assert identity.claude_branch("signoz", "0.128.0") == "chore/claude-signoz-v0.128.0"
    assert identity.claude_branch("@scope/pkg", "2.0.0") == "chore/claude-scope-pkg-v2.0.0"
