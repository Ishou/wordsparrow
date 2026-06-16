---
name: issue-dev
description: Issue-driven development for Bliss — treat a GitHub issue as the living spec, capture ideas, develop and refine the spec in the issue, view the prioritized backlog, and launch an implementer from a ready issue. Use when the user says "capture this idea", "spec out issue #N", "write the spec for #N", "refine #N", "fold these comments into #N", "show the backlog", "what's next to work on", "launch issue #N", "implement issue #N", "start work on #N", or asks to turn a prioritized issue into a PR. Encodes ADR-0069: read/write issues via the portable IssueTracker CLI (never gh directly), move them across the status:* board, dispatch the implementer via the dispatch skill, and let the merge close the issue. Commands: /capture, /spec, /refine, /backlog, /launch. Comment-driven ChatOps commands: /approve, /launch, /respec, /replan, /answer.
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
scripts/issues/issues get <id>            # {id,title,body,labels,state,url,status}
scripts/issues/issues comments <id>       # the steering thread
scripts/issues/issues list --status ready # backlog (native board column)
scripts/issues/issues set-status <id> building     # board move (audited)
scripts/issues/issues add-label <id> needs-human   # escalation (audited)
scripts/issues/issues comment <id> --body "…"      # human-facing note
scripts/issues/issues check <id>          # deterministic proofs on the spec body (exit 1 = problems)
scripts/issues/issues check-plan <id>     # same proofs on the latest plan comment
```

**Proof loop (AI + deterministic, ADR-0069):** the spec-writer and plan-writer
agents **gate their output on** `check` / `check-plan` — its output is
authoritative, not advisory. Cite feasibility evidence as `path:line`, run the
checker on the draft, fix every reported `PROBLEM`, and re-run until it exits clean
before finalizing. The chatops workflow re-runs the checker as a safety net: a
fabricated `path:line` fails the run and the spec/plan does not advance.

Set `ISSUE_ACTOR` so audit comments attribute correctly:
`ISSUE_ACTOR="launch:<session-or-run-id>" scripts/issues/issues set-status …`.

Lifecycle is **adapter-native** (ADR-0069 amended) with **two human gates** —
one for the spec, one for the plan:
`idea` → `needs_input` → `ready` → `plan_review` → `planned` → `building` →
**Done**. It maps to the platform's real board column — the built-in `Status`
single-select field on GitHub (NOT a `status:*` label).
- `needs_input` — **spec gate**: agent drafts the spec, parks here with a comment;
  maintainer approves (→ `ready`) or `/respec` (→ `idea`, fresh spec).
- `ready` — spec approved; agent **writes the implementation plan** (parking).
- `plan_review` — **plan gate**: plan awaits the maintainer; approve (→ `planned`),
  `/replan` (redo the plan), or `/respec` (back to `idea` when the spec is wrong).

**ChatOps commands by size of change:** `/answer` folds a *small* maintainer
input into the existing spec; `/respec` regenerates the *whole* spec from scratch
(→ `idea`, then the spec-writer agent → `needs_input`); `/replan` regenerates the
*whole* plan (→ `ready`, then write_plan → `plan_review`). Both `/respec` and
`/replan` take optional free-form context describing the big change.
- `planned` — plan approved, queued for `/launch`.
The agent never auto-advances past a gate. `set-status` moves the card;
`list --status <s>` filters by it. **Priority stays a label** (`priority:*`) and
ranks within a column; `needs-human` (a label) flags a *launched* issue that hit a
wall — distinct from the `needs_input` status.

## /capture "<idea>" — the procedure

The low-friction inbox. Derive a concise title from the idea, create the issue,
then move it to the `idea` board column (status is a field, not a label):

```sh
ISSUE_ACTOR=capture scripts/issues/issues create \
  --title "<concise title>" --body "<idea>"
ISSUE_ACTOR=capture scripts/issues/issues set-status <id> idea
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
3. **Feasibility-gate every option (hard requirement).** Before the spec can go
   `ready`, each concrete approach/option in the body must be feasibility-checked
   against the actual code — not assumed from how the stack usually works. For each
   option, either **cite the file/structure that makes it work** (open it and
   confirm), or label it **`UNVALIDATED — confirm <X> first`** and do not present it
   as a vetted choice. A caveat written *inside* an option ("needs to confirm…") is
   forbidden — resolve it, or label the whole option UNVALIDATED. Architectural
   verbs ("derive at render time", "inherit from", "share at build time") are the
   highest-risk; confirm the mechanism exists in *this* repo. **You may not
   `set-status ready` while any option is still UNVALIDATED** — finish the check or
   drop the option. (2026-06-15: #976's CNPG spec proposed "derive `waitImage` from
   the db-chart `imageName` at render time" — impossible, the charts are separate
   Helm releases and the code comment said so; it shipped as a vetted choice and
   broke three stages later.)
4. Flip to ready: `scripts/issues/issues set-status <id> ready` — **unless you
   hit a decision only the maintainer can make** (scope, a product call, an
   ambiguous requirement). Then park it at the human-decision gate instead:
   `scripts/issues/issues set-status <id> needs_input` and post the question as a
   comment. The maintainer moves it back to `idea` (`/respec`) or to `ready`
   (approved); a later `/refine` folds their answer into the body.
5. ADR-worthy work (new dependency, cross-context contract, deploy-target change)
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
scripts/issues/issues list --status ready
```

Group the results by `priority:high` → `medium` → `low` (oldest-first within each)
and present a compact table: issue #, title, priority. `list --status idea` and
`list --status building` show the other columns. This is the terminal view of the same backlog
the board renders visually; the launcher picks the highest-priority ready issue.

## /launch <issue#> — the procedure

You are the **orchestrator**. You do not write the implementation yourself; you
dispatch an implementer (ADR-0001 §6: implementer ≠ reviewer) and shepherd it.

### 1. Read and gate
- `scripts/issues/issues get <id>` and `… comments <id>`. The body + comments are
  the brief.
- **Gate on `status` (the `get` output's `status` field):**
  - `ready` → proceed.
  - `idea` → the spec isn't finished. Tell the user to `/spec <id>` first
    (or, if the body is already a complete spec, confirm with the user before
    proceeding).
  - `building` → likely already launched. Check for an open PR that says
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
Report the blocker. `needs-human` is the Blocked signal on the board; leave the
status at `building` so the in-flight state is visible.

## ChatOps commands (comment-driven, OWNER-only)

`.github/workflows/issue-dev-chatops.yml` (ADR-0069) lets the maintainer drive the
lifecycle from issue comments — no polling. A comment that **leads** with a slash
command, posted by the repo `OWNER`, maps to a board action (the pure mapper lives
in `scripts/issues/chatops.py`):

| Command | At status | Effect |
|---|---|---|
| `/approve` | Needs Input | → Ready, then the agent **writes the implementation plan** (plan gate) |
| `/approve` | Plan Review | → Planned |
| `/launch` | Planned (also Ready / Needs Input as a maintainer override) | → Building, then the agent **dispatches the implementer** → PR `Closes #<id>` |
| `/respec [context]` | Idea / Needs Input / Ready / Plan Review / Planned | → Idea, then the agent **regenerates the whole spec** → Needs Input |
| `/replan [context]` | Plan Review / Planned | → Ready, then the agent **regenerates the whole plan** → Plan Review |
| `/answer <text>` | any | fold the maintainer's small input into the spec body; no status change |

Anything else (plain prose, bot `🤖` audit comments, out-of-gate transitions) is a
no-op. Board writes from CI need the **`ISSUE_PROJECT_PAT`** secret — a **classic**
PAT with `project` + `repo` + `read:org` (fine-grained PATs cannot reach a
user-owned Projects v2 board; the default `GITHUB_TOKEN` cannot write the field).
**Done-on-merge** is GitHub Projects' native "Item closed → Done" workflow, not
this automation.

## What this skill is NOT
- Not a code-writer — it orchestrates. Implementation happens in the dispatched
  agent's worktree.
- Not a replacement for the dispatch skill — it sits on top of it, adding the
  issue read/gate/board-move/close wiring.

See ADR-0069 and its design spec for the full rationale.
