---
description: Launch an implementer from a prioritized GitHub issue (ADR-0069). Reads the issue body + comments as the spec via the portable IssueTracker CLI, moves it to status:building, dispatches the implementer (dispatch skill) to open a PR that Closes the issue, and schedules the auto-merge cron. needs-human on failure.
---

# /launch — turn a prioritized issue into a PR

Invoke the `issue-dev` skill and follow its "/launch" procedure end to end.

## Invocation

- `/launch <issue#>` — launch that issue.
- `/launch` (no arg) — pick the top of the backlog:
  `scripts/issues/issues list --label status:ready`, highest `priority:*`,
  oldest-first tiebreak; confirm the choice with the user before dispatching.

## What it does

1. Reads the issue (`scripts/issues/issues get` / `comments`) — body + thread are
   the brief. Gates on `status:ready` (idea → suggest `/spec` first).
2. Moves it to `status:building` (audited).
3. Dispatches the implementer per the `dispatch` skill; the PR body `Closes #<id>`.
4. Schedules the auto-merge cron (merge on §6a LGTM + green).
5. On merge, the issue auto-closes → Done. On failure, labels `needs-human`.

All issue I/O goes through `scripts/issues/issues` (never `gh` directly), keeping
it portable and auto-audited. See `.claude/skills/issue-dev/SKILL.md`.
