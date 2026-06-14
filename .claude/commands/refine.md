---
description: Fold new issue comments into the issue body (ADR-0069 comment-driven steering). Reads the steering thread via the portable IssueTracker CLI, updates the spec body to reflect it, and replies with a one-line summary of what changed.
---

# /refine — steer the spec via comments

Invoke the `issue-dev` skill and follow its "/refine" procedure.

## Invocation

- `/refine <issue#>` — fold the latest comments into the spec body.

## What it does

1. Reads the steering thread via `scripts/issues/issues comments <id>` (and the
   current body via `… get <id>`).
2. Folds new maintainer instructions into the body with
   `scripts/issues/issues update-body <id> --body "<revised spec>"` — the body
   stays the single authoritative spec; comments are the steering log.
3. Posts a one-line summary of what changed:
   `scripts/issues/issues comment <id> --body "<summary>"`.

This mirrors steering a live session, but asynchronously and from anywhere. All
issue I/O goes through the portable CLI, never `gh` directly. See
`.claude/skills/issue-dev/SKILL.md`.
