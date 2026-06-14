# ADR-0069: Issue-driven development — tracker port + status lifecycle

## Status
Accepted

## Context
Feature work currently lives in files (`docs/superpowers/specs/*`,
`docs/superpowers/plans/*`) driven by `/orchestrate`. Those are invisible until
sought, unrankable at a glance, and not steerable remotely. We want GitHub
issues to be the entry point and living spec: an online prioritizable backlog,
an idea inbox, comment-driven refinement, and low-friction implementer launch —
while staying portable to another forge (e.g. GitLab CI). Full design:
`docs/superpowers/specs/2026-06-14-issue-driven-development-design.md`.

## Decision
Introduce an `IssueTracker` port (`scripts/issues/`) that every skill, launcher,
and CI step calls instead of `gh` directly. A `GitHubTracker` adapter shells to
`gh` (no new runtime dependency); a `GitLabTracker` (shells to `glab`) is added
later with zero caller changes. An `AuditingTracker` decorator comments on every
mutation, so the issue thread is the portable audit log.

**Lifecycle status is an abstract concept the port owns; each adapter maps it to
the platform's *native* board mechanism (amended 2026-06-14 — see below):** the
port exposes a `Status` enum (`IDEA|NEEDS_INPUT|READY|BUILDING`) and `set_status(id, status)`
meaning "move to this board column." The adapter decides the representation —
**GitHub** uses a Projects v2 single-select field (the real board column; mutual
exclusion is native to single-select, no `status:*` labels); **GitLab** uses
scoped labels `status::idea|needs_input|ready|building` (mutually exclusive by the `::`
convention, the native backing of GitLab Issue Board lists). `close` moves to
Done. **Priority stays label-driven** on both (`priority:*` ranks within a column;
it filters natively on either platform and doesn't benefit from being a native
column). `needs-human` flags escalation. Commands (`/capture`, `/spec`,
`/refine`, `/launch`, `/backlog`) call the CLI; the portable automation path is a
CI **scheduled poll** of ready issues (GitHub issue-event triggers are an optional
accelerator GitLab lacks).

## Consequences
Specs move from reviewed files to issue bodies — intent, not shipped code: the
implementer PR still passes §6a, and ADR-worthy decisions still go through
reviewed ADR files. The workflow gains an online prioritizable backlog and
remote steerability, and the orchestration layer stops hardcoding `gh`. Costs: a
new Python module + CLI to maintain, and care with `gh` rate limits under
polling. Relates to ADR-0001 (file-based plans, still used) and ADR-0068
(issues as breaking-bump spines).

## Amendment 2026-06-14 — status is adapter-native, not label-driven
The original decision made `status:*` GitHub labels the board substrate. That
left the GitHub Projects v2 board needing a parallel single-select field
(duplicate state, drift) or a noisy label-grouped board. Resolution: the port
treats status as an abstract lifecycle and each adapter maps it to the platform's
native board column — GitHub Projects v2 single-select field (via `gh project
item-edit`/`item-list`/`field-create`; needs the `project` OAuth scope and a
configured project), GitLab scoped `status::*` labels later. `priority:*` stays a
label on both. Cost: GitHub status reads/writes now go through Projects v2
(more `gh` calls, an item must be on the project) instead of a one-shot label
edit; the backlog `list` queries project items by field value. Benefit: a clean
native board on each platform with mutual exclusion enforced by the platform, and
a more honest port (move-to-column, not set-a-label). Implementation:
`docs/superpowers/plans/2026-06-14-issue-driven-development.md` Wave 8.

## Amendment 2026-06-14 (addendum) — `needs_input` human-decision gate

`Status` enum gains `NEEDS_INPUT` between `IDEA` and `READY`:
`IDEA | NEEDS_INPUT | READY | BUILDING`. When an agent cannot finish
speccing without a maintainer decision (scope, product call, ambiguous
requirement), it parks the issue at `needs_input` and posts the question
as a comment. The maintainer moves it back to `idea` (rework) or forward
to `ready` (approved). `needs-human` (a label) remains distinct — it flags
a *launched* issue that hit an implementation wall, not a spec gate.
GitLab forward-look: `status::idea|needs_input|ready|building`.
