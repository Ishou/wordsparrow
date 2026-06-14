---
description: Turn a captured idea into an implementable spec, written into the GitHub issue body (ADR-0069). Runs the brainstorming flow with the issue body as the terminal artifact and flips the issue to status:ready.
---

# /spec — brainstorm a spec into the issue body

Invoke the `issue-dev` skill and follow its "/spec" procedure.

## Invocation

- `/spec <issue#>` — develop the spec for that issue.

## What it does

1. Reads the current issue via `scripts/issues/issues get <id>` (body + labels).
2. Runs the `superpowers:brainstorming` skill — but the **terminal artifact is the issue
   body**, not a `design.md` file. Writes the agreed spec with
   `scripts/issues/issues update-body <id> --body "<spec>"`.
3. Flips the issue to ready: `scripts/issues/issues set-status <id> ready`.
4. ADR-worthy work (new dependency, contract change, deploy-target change) still
   writes/links an ADR file — the issue body links to it.

All issue I/O goes through the portable CLI, never `gh` directly. After `/spec`,
the issue shows up in `/backlog` and is ready to `/launch`. See
`.claude/skills/issue-dev/SKILL.md`.
