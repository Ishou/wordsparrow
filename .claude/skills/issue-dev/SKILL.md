---
name: issue-dev
description: Issue-driven development for Bliss — treat a GitHub issue as the living spec, capture ideas, develop and refine the spec in the issue, view the prioritized backlog, and launch an implementer from a ready issue. Use when the user says "capture this idea", "spec out issue #N", "write the spec for #N", "refine #N", "fold these comments into #N", "show the backlog", "what's next to work on", "launch issue #N", "implement issue #N", "start work on #N", or asks to turn a prioritized issue into a PR. Encodes ADR-0069: read/write issues via the portable IssueTracker CLI (never gh directly), move them across the status:* board, dispatch the implementer via the dispatch skill, and let the merge close the issue. Commands: /capture, /spec, /refine, /backlog, /launch.
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

## /capture "<idea>" — the procedure

The low-friction inbox. Derive a concise title from the idea and create a
`status:idea` issue:

```sh
ISSUE_ACTOR=capture scripts/issues/issues create \
  --title "<concise title>" --body "<idea>" --label status:idea
```

Do NOT add `ai-driven` — that label is for pipeline-synthesized issues, not human
captures. No-arg invocation: ask the user for the idea first. The issue lands in
Inbox; `/spec <id>` later turns it into an implementable spec.

## /spec <issue#> — the procedure

Turn a captured idea into an implementable spec, written into the **issue body**.

1. Read the current issue: `scripts/issues/issues get <id>`.
2. Run the `superpowers:brainstorming` skill, but the terminal artifact is the issue body —
   not a `design.md` file. Write the agreed spec:
   `scripts/issues/issues update-body <id> --body "<spec>"`.
3. Flip to ready: `scripts/issues/issues set-status <id> ready`.
4. ADR-worthy work (new dependency, cross-context contract, deploy-target change)
   still writes/links a reviewed ADR file; the body links to it.

If the idea is really several workstreams, split it into linked issues rather
than one oversized spec.

## /refine <issue#> — the procedure

Comment-driven steering — the asynchronous equivalent of steering a live session.

1. Read the thread: `scripts/issues/issues comments <id>` (and `… get <id>`).
2. Fold new instructions into the body:
   `scripts/issues/issues update-body <id> --body "<revised spec>"`. The body is
   the single authoritative spec; comments are the steering log, not the spec.
3. Reply with a one-line summary of what changed:
   `scripts/issues/issues comment <id> --body "<summary>"`.

## /backlog — the procedure

```sh
scripts/issues/issues list --label status:ready
```

Group the results by `priority:high` → `medium` → `low` (oldest-first within each)
and present a compact table: issue #, title, priority. `--all` also lists
`status:idea` and `status:building`. This is the terminal view of the same backlog
the board renders visually; the launcher picks the highest-priority ready issue.

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

See ADR-0069 and its design spec for the full rationale.
