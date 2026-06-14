# Issue-driven development: tracker port + label lifecycle

**Date:** 2026-06-14
**Status:** Design (pending implementation plan)
**Relates to:** ADR-0001 (file-based plans — still used), ADR-0068 (issues as breaking-bump spines)

## Motivation

Today a feature travels through files: `brainstorming` writes a
`docs/superpowers/specs/<date>-<topic>-design.md`, `writing-plans` writes a
`docs/superpowers/plans/<slug>.md`, and `/orchestrate` drives a cron over that
plan. Those files are invisible until you go looking, can't be reordered or
triaged at a glance, and can't be steered from a phone.

We want GitHub issues to be the **entry point and home** for feature work:

- an **online, shared, human-visible backlog** that is easy to prioritize;
- a low-friction **idea inbox** (capture/triage);
- a **living spec** per feature — the issue body is the spec, and maintainer
  comments steer it the way comments steer a live session;
- **low-friction implementer launch** from a prioritized issue.

The solution must be **portable to another forge** (e.g. GitLab CI) — so the
machine-read substrate is **labels + issues + comments** (both platforms have
them, both CLIs `gh`/`glab` expose them), never a platform-specific layer like
GitHub Projects v2 custom fields.

## Goals

- One port, `IssueTracker`, that every skill / launcher / CI step calls instead
  of `gh` directly.
- A GitHub adapter now; a GitLab adapter later with **zero caller changes**.
- A label-driven lifecycle that renders as a board on either platform.
- Manual-now commands (`/launch`, `/capture`, `/spec`, `/refine`, `/backlog`)
  whose logic is reused verbatim by a CI-native trigger later.
- Every agent mutation of an issue leaves an **audit comment**.

## Non-goals

- Replacing ADRs. Architecture decisions stay versioned files; specs move to
  issues. ADR-worthy work writes an ADR file and links it from the issue.
- Migrating historical specs/plans. New work uses issues; old files stay.
- CI-native event triggers in v1 (designed for, deferred — see Phasing).
- Strict machine-read drag-rank ordering (priority buckets + oldest-first
  tiebreak are enough; drag-rank is a human visual cue only, not portable).

## Architecture

### The port — `IssueTracker` (Python ABC)

Lives in `scripts/issues/`, matching the existing python tooling pattern
(`scripts/infra_diagrams/`, `modal_jobs/`). The port is the contract; callers
depend only on it.

| Verb | Purpose |
|---|---|
| `create(title, body, labels) -> IssueRef` | capture / spec authoring |
| `get(id) -> Issue` | read current spec (title, body, labels, state) |
| `list(labels=[], state="open") -> [Issue]` | backlog views; launcher picks next |
| `update_body(id, body)` | spec refinement |
| `comment(id, body)` | post an update |
| `comments(id) -> [Comment]` | read the maintainer steering thread |
| `set_status(id, status)` | board move (label swap) |
| `set_priority(id, priority)` | rank bucket (label swap) |
| `add_label(id, label)` / `remove_label(id, label)` | escalation etc. |
| `close(id, reason)` | -> Done |

`set_status` / `set_priority` are convenience wrappers over label add/remove so
the lifecycle is expressed in the port, not hardcoded in each caller.

### Port invariants

Enforced inside the port so the board can never reach a contradictory state:

- at most one `status:*` label at a time (`set_status` removes the others);
- at most one `priority:*` label at a time;
- `close` clears `status:*` (Done is the closed state, not a column label).

These are defined once as a contract test and run against **every** adapter and
the fake.

### Adapter — `GitHubTracker(IssueTracker)`

Shells to `gh` (`gh issue create/view/list/edit/comment/close`, JSON I/O). No
API SDK, so **no new runtime dependency** (avoids an ADR-for-dependency) and
auth/pagination come from `gh`. Backend selected by env `ISSUE_TRACKER=github`
(default). A future `GitLabTracker` shells to `glab` and is selected by
`ISSUE_TRACKER=gitlab`.

### Cross-cutting — `AuditingTracker(IssueTracker)`

A decorator that wraps any tracker. After every **mutating** verb it posts a
structured audit comment via the wrapped tracker's own `comment()`, then
delegates. The base adapter stays pure; auditing works for any backend.

Audit comment shape (machine-greppable, human-readable):

```
🤖 launch · status: ready → building · actor: <session-id|ci-run-url> · 2026-06-14T11:42Z
```

The comment thread becomes the portable audit log — no separate log file,
consistent with "the issue is the source of truth," and it ports for free.

### Fake — `InMemoryTracker(IssueTracker)`

Implements the same port in memory for unit-testing launcher/flow logic without
network. Matches the repo rule: mock only at boundaries; use real in-memory
implementations for things we wrote.

### CLI

`python -m issues <verb> ...` with JSON in/out is the single surface skills and
CI invoke. It instantiates `AuditingTracker(GitHubTracker())` by default.

## Label & lifecycle model

Board columns are labels, so the board renders identically on a GitHub
Projects board (label-backed) or a GitLab Issue Board.

| Label | Board column | Meaning |
|---|---|---|
| `status:idea` | Inbox | captured, not yet implementable |
| `status:ready` | Ready | spec complete enough to build |
| `status:building` | Building | implementer launched, PR(s) in flight |
| *(closed issue)* | Done | merged → issue auto-closes via `Closes #id` |
| `needs-human` *(existing, ADR-0068)* | Blocked | escalation |

- **Done = closed issue**, not a `status:done` label — both boards have a native
  Done/Closed column; closing is the portable canonical signal and can't drift.
- **Priority is orthogonal:** `priority:high|medium|low` (already created) ranks
  within a column. The launcher picks `status:ready` + highest `priority:*`,
  oldest-first tiebreak.
- **Provenance:** issues an agent created keep the existing `ai-driven` label, so
  human-authored vs agent-authored ideas are filterable.

## Flows (commands)

Each command is a thin skill/command calling the CLI; heavy lifting reuses the
existing `dispatch` and `brainstorming` machinery.

1. **Capture** — `/capture "<idea>"` → creates a `status:idea` + `ai-driven`
   issue. (Also doable straight from the issue UI; the command is just sugar.)
2. **Spec** — `/spec <id>` → runs the brainstorming flow with the **issue body**
   as the terminal artifact (not a `design.md`); flips `status:idea → ready`.
   ADR-worthy work additionally writes/links an ADR file.
3. **Refine** — `/refine <id>` → reads new comments since the last agent sync,
   updates the body to reflect them, replies in-thread with what changed. This
   is the "comments steer it like a session" channel.
4. **Launch** — `/launch <id>` → reads body + comment thread as the brief →
   `status:ready → building` → dispatches the `dispatch` worktree-agent flow →
   opens PR(s) with `Closes #id` → schedules the default auto-merge cron. On
   merge the issue auto-closes (Done). On failure/cap-lock → `needs-human`.
5. **Backlog** — `/backlog` → `list(status:ready)` grouped by priority (terminal
   view; the board is the visual one).

## Portability seam (manual-now → CI-later)

Every command's logic lives in the skill calling the CLI. The CI-native version
invokes the **same** CLI from a scheduled pipeline — both `gh` and `glab` support
schedules — so no rewrite, just a new trigger:

- **GitHub** can additionally use `issues` / `issue_comment` event triggers.
- **GitLab CI** has no native issue-event trigger, so the portable design is a
  **scheduled poll** of `list(status:ready)` / changed comments. Event triggers
  are an optional GitHub-only accelerator layered on the same CLI.

## Testing

- `InMemoryTracker` fake → unit-test launcher/flow logic offline.
- `AuditingTracker` against the fake → assert each mutation emits exactly one
  audit comment with the correct transition.
- Port invariants (one `status:*`, one `priority:*`, close clears status) as a
  contract test run against the fake and every adapter.
- `GitHubTracker` → one thin smoke test (a real round-trip on a throwaway
  issue); contract tests carry the rest since it is mostly `gh` shelling.

## ADR-first

This introduces a new development-workflow contract, so per CLAUDE.md a new ADR
("Issue-driven development: tracker port + label lifecycle") merges before the
code. It captures the port contract, the label/board model, the
manual-now/CI-later seam, and cross-links ADR-0001 and ADR-0068. It is Wave 1.

## Phasing (waves; writing-plans will detail; each ≤400 lines)

1. **ADR + port + `GitHubTracker` + `InMemoryTracker` + `AuditingTracker` +
   CLI** — foundation, no behavior change.
2. **Labels/board bootstrap** — create `status:*` labels; document board setup
   for GitHub and GitLab.
3. **`/launch`** — highest-value command; wires the port to `dispatch` +
   auto-merge cron.
4. **`/capture` + `/backlog`** — inbox + view.
5. **`/spec` + `/refine`** — brainstorming-into-issue + comment-driven refine.
6. *(later)* CI-native triggers — scheduled poll on `status:ready`; comment-event
   refine on GitHub.

## Risks / open questions

- **`gh` rate limits / latency** under a polling CI loop — mitigate with
  `list` filters and a sane schedule cadence (reuse the 2-min orchestration
  cadence only where needed).
- **Spec-in-issue loses PR review** that `design.md` files got via §6a. Accepted:
  specs are intent, not shipped code; the implementer's PR still gets §6a, and
  ADR-worthy decisions still go through a reviewed ADR file.
- **Body-vs-comments drift** — `/refine` must keep the body authoritative;
  comments are the steering log, the body is the current spec.
- **GitLab parity gaps** (e.g. issue "weight" is tier-gated) — the design avoids
  them by staying on labels; revisit only if GitLab adapter work surfaces a gap.
