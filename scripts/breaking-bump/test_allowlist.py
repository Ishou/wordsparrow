"""Unit tests for allowlist — the signoz-only rollout gate."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import allowlist  # noqa: E402


def test_load_allowlist_reads_deps_list(tmp_path):
    f = tmp_path / "allowlist.yaml"
    f.write_text("deps:\n  - signoz\n  - cert-manager\n")
    assert allowlist.load_allowlist(f) == ["signoz", "cert-manager"]


def test_load_allowlist_empty_when_no_deps_key(tmp_path):
    f = tmp_path / "allowlist.yaml"
    f.write_text("deps: []\n")
    assert allowlist.load_allowlist(f) == []


def test_is_allowlisted_exact_match():
    assert allowlist.is_allowlisted("signoz", ["signoz"]) is True


def test_is_allowlisted_rejects_non_member():
    # The whole point of signoz-only: everything else short-circuits.
    assert allowlist.is_allowlisted("react", ["signoz"]) is False


def test_is_allowlisted_is_case_insensitive():
    assert allowlist.is_allowlisted("SigNoz", ["signoz"]) is True


def test_is_allowlisted_empty_allowlist_blocks_all():
    assert allowlist.is_allowlisted("signoz", []) is False
