# ADR-0069: Issue-driven development — tracker port + label lifecycle

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
mutation, so the issue thread is the portable audit log. Lifecycle is
label-driven so it renders as a board on either platform:
`status:idea|ready|building` are the columns (Done = closed issue), `priority:*`
ranks within a column, `needs-human` flags escalation. Port invariants: at most
one `status:*` and one `priority:*` label at a time; `close` clears `status:*`.
Commands (`/capture`, `/spec`, `/refine`, `/launch`, `/backlog`) call the CLI;
the portable automation path is a CI **scheduled poll** of `status:ready`
(GitHub issue-event triggers are an optional accelerator GitLab lacks).

## Consequences
Specs move from reviewed files to issue bodies — intent, not shipped code: the
implementer PR still passes §6a, and ADR-worthy decisions still go through
reviewed ADR files. The workflow gains an online prioritizable backlog and
remote steerability, and the orchestration layer stops hardcoding `gh`. Costs: a
new Python module + CLI to maintain, and care with `gh` rate limits under
polling. Relates to ADR-0001 (file-based plans, still used) and ADR-0068
(issues as breaking-bump spines).
