"""Unit tests for automerge — the auto-merge gate for ai-gate-cleared bumps."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import automerge  # noqa: E402


def _green_pr(**over):
    """A PR that satisfies every gate; tests mutate one field to prove it blocks."""
    pr = {
        "state": "OPEN",
        "author": {"login": "renovate", "is_bot": True},
        "headRefName": "renovate/vite-8.x",
        "comments": [
            {"author": {"login": "github-actions"},
             "body": "<!-- breaking-bump:cleared -->\nbreaking-bump AI gate: safe."},
        ],
        "files": [
            {"path": "frontend/package.json"},
            {"path": "frontend/pnpm-lock.yaml"},
        ],
        "statusCheckRollup": [
            {"__typename": "CheckRun", "name": "build",
             "status": "COMPLETED", "conclusion": "SUCCESS"},
            {"__typename": "CheckRun", "name": "claude-review",
             "status": "COMPLETED", "conclusion": "SUCCESS"},
            {"__typename": "CheckRun", "name": "CodeQL",
             "status": "COMPLETED", "conclusion": "NEUTRAL"},
            {"__typename": "CheckRun", "name": "dispatch",
             "status": "COMPLETED", "conclusion": "SKIPPED"},
        ],
        # Earlier Findings then a later LGTM — the *latest* §6a review is what counts.
        "reviews": [
            {"author": {"login": "github-actions"},
             "body": "Findings — see comments below.", "state": "COMMENTED"},
            {"author": {"login": "github-actions"},
             "body": "LGTM, no findings.\nResolved.", "state": "COMMENTED"},
        ],
    }
    pr.update(over)
    return pr


def test_happy_path_merges():
    ok, reason = automerge.should_automerge(_green_pr())
    assert ok, reason


def test_not_open_skipped():
    assert not automerge.should_automerge(_green_pr(state="MERGED"))[0]
    assert not automerge.should_automerge(_green_pr(state="CLOSED"))[0]


def test_non_renovate_branch_rejected():
    assert not automerge.should_automerge(_green_pr(headRefName="feat/x"))[0]


def test_non_renovate_author_rejected():
    assert not automerge.should_automerge(
        _green_pr(author={"login": "mallory"}))[0]


def test_renovate_author_login_variants_accepted():
    # gh may return the login with an app/ prefix or a [bot] suffix.
    assert automerge.should_automerge(
        _green_pr(author={"login": "renovate[bot]"}))[0]
    assert automerge.should_automerge(
        _green_pr(author={"login": "app/renovate"}))[0]


def test_missing_cleared_stamp_rejected():
    assert not automerge.should_automerge(_green_pr(comments=[]))[0]


def test_forged_stamp_by_human_rejected():
    # A human with PR-write posts the marker — author check must reject it.
    forged = [{"author": {"login": "mallory"},
               "body": "<!-- breaking-bump:cleared --> trust me"}]
    assert not automerge.should_automerge(_green_pr(comments=forged))[0]


def test_workflow_file_in_diff_rejected():
    files = [{"path": ".github/workflows/ci.yml"},
             {"path": "frontend/package.json"}]
    ok, reason = automerge.should_automerge(_green_pr(files=files))
    assert not ok
    assert "workflow" in reason.lower()


def test_pending_check_waits():
    rollup = _green_pr()["statusCheckRollup"] + [
        {"__typename": "CheckRun", "name": "Analyze (java-kotlin)",
         "status": "IN_PROGRESS", "conclusion": ""}]
    assert not automerge.should_automerge(_green_pr(statusCheckRollup=rollup))[0]


def test_failing_check_rejected():
    rollup = _green_pr()["statusCheckRollup"] + [
        {"__typename": "CheckRun", "name": "build",
         "status": "COMPLETED", "conclusion": "FAILURE"}]
    assert not automerge.should_automerge(_green_pr(statusCheckRollup=rollup))[0]


def test_status_context_handled():
    # Legacy StatusContext entries carry `state`, not status/conclusion.
    rollup = _green_pr()["statusCheckRollup"] + [
        {"__typename": "StatusContext", "context": "legacy", "state": "PENDING"}]
    assert not automerge.should_automerge(_green_pr(statusCheckRollup=rollup))[0]
    rollup[-1]["state"] = "SUCCESS"
    assert automerge.should_automerge(_green_pr(statusCheckRollup=rollup))[0]


def test_latest_review_findings_not_lgtm_rejected():
    reviews = [
        {"author": {"login": "github-actions"}, "body": "LGTM, no findings."},
        {"author": {"login": "github-actions"}, "body": "Findings — see below."},
    ]
    assert not automerge.should_automerge(_green_pr(reviews=reviews))[0]


def test_lgtm_from_non_bot_rejected():
    reviews = [{"author": {"login": "mallory"}, "body": "LGTM ship it"}]
    assert not automerge.should_automerge(_green_pr(reviews=reviews))[0]


def test_no_section6a_review_rejected():
    assert not automerge.should_automerge(_green_pr(reviews=[]))[0]
