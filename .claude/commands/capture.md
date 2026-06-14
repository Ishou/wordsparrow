---
description: Capture an idea as a status:idea GitHub issue (ADR-0069 inbox). Creates the issue via the portable IssueTracker CLI so it lands in the backlog's Inbox column for later /spec and prioritization.
---

# /capture — drop an idea into the backlog inbox

Invoke the `issue-dev` skill and follow its "/capture" procedure.

## Invocation

- `/capture "<idea>"` — create a `status:idea` issue from the idea text.
- `/capture` (no arg) — ask the user for the idea first, then create it.

## What it does

Derives a concise title from the idea and creates the issue via the portable CLI:

```sh
ISSUE_ACTOR=capture scripts/issues/issues create \
  --title "<concise title>" --body "<idea>" --label status:idea
```

It does NOT add `ai-driven` (that label marks pipeline-synthesized issues, not
human captures). The new issue lands in the Inbox column; run `/spec <id>` when
ready to turn it into an implementable spec. See `.claude/skills/issue-dev/SKILL.md`.
