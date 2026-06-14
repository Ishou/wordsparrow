---
description: Show the prioritized issue backlog (ADR-0069). Lists status:ready issues grouped by priority via the portable IssueTracker CLI, so you can see what's next to /launch.
---

# /backlog — view the prioritized backlog

Invoke the `issue-dev` skill and follow its "/backlog" procedure.

## Invocation

- `/backlog` — list `status:ready` issues grouped by priority.
- `/backlog --all` — also include `status:idea` (Inbox) and `status:building`.

## What it does

```sh
scripts/issues/issues list --label status:ready
```

Groups the results by `priority:high` → `medium` → `low` (oldest-first within
each), and presents a compact table: issue #, title, priority. This is the
terminal view of the same backlog the board renders visually. See
`.claude/skills/issue-dev/SKILL.md`.
