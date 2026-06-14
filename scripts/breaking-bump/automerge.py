"""Auto-merge gate for ai-gate-cleared dependency bumps (ADR-0068).

Pure decision over a `gh pr view --json ...` payload; the workflow is glue. A PR
auto-merges only when every gate holds — see `should_automerge`.
"""
from __future__ import annotations

STAMP_MARKER = "<!-- breaking-bump:cleared -->"
BOT = "github-actions"            # github-actions[bot], login as gh returns it
RENOVATE = "renovate"
WORKFLOW_PREFIX = ".github/workflows/"

GREEN_CONCLUSIONS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
GREEN_STATES = {"SUCCESS"}        # legacy StatusContext.state
PENDING_STATUSES = {"IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED"}
PENDING_STATES = {"PENDING", "EXPECTED"}


def _login(actor: dict | None) -> str:
    """Normalise a gh actor login: strip the `app/` prefix and `[bot]` suffix."""
    login = (actor or {}).get("login", "") or ""
    return login.removeprefix("app/").removesuffix("[bot]")


def _has_cleared_stamp(comments: list[dict]) -> bool:
    """The ai-gate cleared marker, posted by github-actions (not human-forgeable)."""
    return any(
        _login(c.get("author")) == BOT and STAMP_MARKER in (c.get("body") or "")
        for c in comments
    )


def _workflow_files(files: list[dict]) -> list[str]:
    """Changed paths under .github/workflows/ — these stay human-gated."""
    return [f["path"] for f in files if (f.get("path") or "").startswith(WORKFLOW_PREFIX)]


def _check_health(rollup: list[dict]) -> tuple[list[str], list[str]]:
    """Partition checks into (pending, failing) names; empty both means all green."""
    pending: list[str] = []
    failing: list[str] = []
    for c in rollup:
        name = c.get("name") or c.get("context") or "?"
        conclusion = c.get("conclusion")
        if conclusion:  # a completed CheckRun
            if conclusion not in GREEN_CONCLUSIONS:
                failing.append(name)
        elif c.get("status") in PENDING_STATUSES:
            pending.append(name)
        elif "state" in c:  # legacy StatusContext
            state = c["state"]
            if state in GREEN_STATES:
                continue
            (pending if state in PENDING_STATES else failing).append(name)
        else:  # a CheckRun with no conclusion yet
            pending.append(name)
    return pending, failing


def _section6a_lgtm(reviews: list[dict]) -> bool:
    """True iff the latest github-actions review body starts with 'LGTM'."""
    bot_reviews = [r for r in reviews if _login(r.get("author")) == BOT]
    if not bot_reviews:
        return False
    return (bot_reviews[-1].get("body") or "").lstrip().startswith("LGTM")


def should_automerge(pr: dict) -> tuple[bool, str]:
    """Decide whether an ai-gate-cleared Renovate PR may auto-merge.

    Returns (merge?, reason). Reason is for log output on both branches.
    """
    state = pr.get("state")
    if state != "OPEN":
        return False, f"pr not open (state={state})"

    head = pr.get("headRefName", "")
    if not head.startswith("renovate/"):
        return False, f"head branch not renovate/* ({head})"

    author = _login(pr.get("author"))
    if author != RENOVATE:
        return False, f"author not renovate ({author or '<none>'})"

    if not _has_cleared_stamp(pr.get("comments") or []):
        return False, "no ai-gate cleared stamp from github-actions"

    workflow_hits = _workflow_files(pr.get("files") or [])
    if workflow_hits:
        return False, f"diff touches workflow files (human-gated): {workflow_hits[0]}"

    pending, failing = _check_health(pr.get("statusCheckRollup") or [])
    if failing:
        return False, f"check not green: {failing[0]}"
    if pending:
        return False, f"check still pending: {pending[0]}"

    if not _section6a_lgtm(pr.get("reviews") or []):
        return False, "latest §6a review is not an LGTM"

    return True, "all gates green — auto-merge"


if __name__ == "__main__":
    import json
    import sys

    decision_pr = json.load(sys.stdin)
    merge, why = should_automerge(decision_pr)
    print(why)
    # 0 = merge, 2 = skip cleanly; any other code (e.g. 1 on exception) = error.
    sys.exit(0 if merge else 2)
