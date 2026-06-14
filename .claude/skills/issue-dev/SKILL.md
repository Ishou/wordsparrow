---
name: issue-dev
description: Issue-driven development for Bliss — treat a GitHub issue as the living spec and launch an implementer from it. Use when the user says "launch issue #N", "implement issue #N", "start work on #N", "pick up the top of the backlog", or asks to turn a prioritized issue into a PR. Encodes ADR-0069: read the issue (body + comments) via the portable IssueTracker CLI (never gh directly), move it across the status:* board, dispatch the implementer via the dispatch skill, and let the merge close the issue. Commands: /launch (this wave); /capture, /backlog, /spec, /refine arrive in later waves.
---

# Issue-driven development playbook

Per ADR-0069, a GitHub issue is the entry point and **living spec** for a piece
of work: the body is the spec, the comment thread is the maintainer's steering
(like steering a live session). This skill turns a prioritized issue into a PR.

**Golden rule:** every issue read/write goes through the portable CLI
`scripts/issues/issues <verb>`, never `gh issue …` directly. That's what keeps
the workflow portable to GitLab later (ADR-0069) and what makes every mutation
auto-audited (the `AuditingTracker` posts a `🤖 …` comment per change).

## The CLI

Run from anywhere in the repo:

```sh
scripts/issues/issues get <id>            # {id,title,body,labels,state,url}
scripts/issues/issues comments <id>       # the steering thread
scripts/issues/issues list --label status:ready   # backlog
scripts/issues/issues set-status <id> building     # board move (audited)
scripts/issues/issues add-label <id> needs-human   # escalation (audited)
scripts/issues/issues comment <id> --body "…"      # human-facing note
```

Set `ISSUE_ACTOR` so audit comments attribute correctly:
`ISSUE_ACTOR="launch:<session-or-run-id>" scripts/issues/issues set-status …`.

Lifecycle (board columns = labels): `status:idea` → `status:ready` →
`status:building` → **closed = Done**. `priority:*` ranks within a column.
`needs-human` flags escalation.

## /launch <issue#> — the procedure

You are the **orchestrator**. You do not write the implementation yourself; you
dispatch an implementer (ADR-0001 §6: implementer ≠ reviewer) and shepherd it.

### 1. Read and gate
- `scripts/issues/issues get <id>` and `… comments <id>`. The body + comments are
  the brief.
- **Gate on status:**
  - `status:ready` → proceed.
  - `status:idea` → the spec isn't finished. Tell the user to `/spec <id>` first
    (or, if the body is already a complete spec, confirm with the user before
    proceeding).
  - `status:building` → likely already launched. Check for an open PR that says
    `Closes #<id>`; if one exists, resume shepherding it instead of re-launching.
  - closed → already Done; stop.
- **Scope check:** if the issue clearly spans multiple bounded contexts or is
  larger than one coherent PR, don't launch one mega-implementer — tell the user
  it needs decomposition (a future `/spec` can split it into linked issues).

### 2. Move to Building
```sh
ISSUE_ACTOR="launch:<id>" scripts/issues/issues set-status <id> building
```
This auto-posts the audit comment recording `status: ready → building`.

### 3. Dispatch the implementer (reuse the dispatch skill)
Invoke the `dispatch` skill and follow its agent-dispatch protocol. The
implementer prompt is built from the issue:
- **Brief** = the issue title + body (the spec) + the comment thread (steering).
- **MANDATORY ADR pre-read**: run `scripts/adr-context.sh <paths the issue will
  touch>` and inline the output (dispatch skill step 3).
- **Comment-style preflag** + **CI auto-fix loop**: paste from the dispatch skill.
- **Closes the issue:** the implementer's PR body MUST contain `Closes #<id>` so
  the squash-merge auto-closes the issue → Done column. State this explicitly in
  the prompt.
- Branch `feat/<slug>` (or the type matching the work), DCO sign-off, ≤400-line
  target (cite the soft-target override in the body if the workstream warrants).

Dispatch with `isolation: "worktree"`, `run_in_background: true`, and verify the
agent's PR when it reports (trust but verify: check files, scope, line counts).

### 4. Auto-merge cron
After the PR is open, schedule the standing auto-merge cron (the repo default —
see the dispatch skill's "Cron-driven autonomous orchestration"): merge on §6a
LGTM + green blocking checks. On merge, `Closes #<id>` moves the issue to Done.

### 5. Failure / escalation
If the implementer is blocked, CI wedges past the fix budget, or §6a cap-locks:
```sh
ISSUE_ACTOR="launch:<id>" scripts/issues/issues add-label <id> needs-human
```
Report the blocker. `needs-human` is the Blocked signal on the board; leave
`status:building` so the in-flight state is visible.

## What this skill is NOT
- Not a code-writer — it orchestrates. Implementation happens in the dispatched
  agent's worktree.
- Not a replacement for the dispatch skill — it sits on top of it, adding the
  issue read/gate/board-move/close wiring.

## Coming in later waves (ADR-0069 plan)
- `/capture "<idea>"` — create a `status:idea` + `ai-driven` issue (the inbox).
- `/backlog` — `list --label status:ready` grouped by priority.
- `/spec <id>` — brainstorm into the issue body; flip to `status:ready`.
- `/refine <id>` — fold new comments into the body (comment-driven steering).
