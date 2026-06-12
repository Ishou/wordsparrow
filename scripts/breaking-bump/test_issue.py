"""Unit tests for issue — context-block render/parse and dedup."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import issue  # noqa: E402


def test_render_then_parse_roundtrips():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 814)
    ctx = issue.parse_context_block(body)
    assert ctx == {"dep": "signoz", "from": "0.122.0", "to": "0.128.0", "pr": 814}


def test_context_block_is_hidden_html_comment():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    assert body.startswith("<!--")
    assert body.rstrip().endswith("-->")


def test_parse_missing_block_returns_none():
    assert issue.parse_context_block("just some prose, no block") is None
    assert issue.parse_context_block("") is None


def test_parse_malformed_json_returns_none():
    bad = "<!-- breaking-bump:context\n{not json}\n-->"
    assert issue.parse_context_block(bad) is None


def test_issue_title_carries_identity():
    assert issue.issue_title("signoz", "0.122.0", "0.128.0") == "breaking-bump: signoz@0.122.0→0.128.0"


def test_find_existing_matches_on_full_transition():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    issues = [{"number": 5, "title": issue.issue_title("signoz", "0.122.0", "0.128.0"), "body": body}]
    assert issue.find_existing(issues, "signoz", "0.122.0", "0.128.0") == issues[0]


def test_find_existing_distinguishes_two_0x_bumps():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    issues = [{"number": 5, "title": issue.issue_title("signoz", "0.122.0", "0.128.0"), "body": body}]
    # A different transition of the same dep must NOT match.
    assert issue.find_existing(issues, "signoz", "0.128.0", "0.130.0") is None


def test_find_existing_none_when_empty():
    assert issue.find_existing([], "signoz", "0.122.0", "0.128.0") is None
