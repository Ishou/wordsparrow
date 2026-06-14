# Auto-merge for ai-gate-cleared dependency bumps

**Date:** 2026-06-14
**Status:** Approved (brainstorming) — pending implementation plan
**Governs:** extends ADR-0068 (AI-driven breaking-bump migration pipeline)

## Problem

The breaking-bump dispatcher (`breaking-bump-dispatch.yml`) routes an allowlisted
`>=1.x` minor/patch Renovate PR to a cheap AI "smell test" (the `ai-gate` job).
When the gate returns `green` (no breaking changes), the `mergeable` route today
only posts a comment — `<!-- breaking-bump:cleared -->` "… Safe to merge (human
still clicks merge)." The PR then sits open until a human merges it manually.

We want a cleared minor/patch bump to merge on its own once it is provably safe,
removing the manual click while keeping a strong safety gate.

## Why not GitHub-native auto-merge

`main` is not branch-protected, and GitHub's native auto-merge cannot gate on the
§6a review signal:

- §6a posts a **COMMENTED** review (`reviewDecision` stays empty), so "required
  approvals" never sees its LGTM.
- The `claude-review` **check** completes `SUCCESS` even when the review body lists
  findings, so a required status check on it would not enforce LGTM.

Forcing native auto-merge would require changing `claude-code-review.yml` to emit
APPROVED reviews (a repo-wide §6a semantics change that also trips the
"workflow-self-edit → manual review" path) plus adding branch protection with
required approvals to `main` (gating every PR and every human, including the
dispatcher's own merges). Rejected for blast radius. We instead enforce the gate
in a dedicated workflow.

## Design

### A dedicated event-driven workflow: `breaking-bump-automerge.yml`

**Triggers** — the events that can *complete* the gate:

- `workflow_run: [completed]` filtered to the **CI** and **Claude Code Review**
  workflows (the last checks to finish), and
- `pull_request_review: [submitted]` (the §6a LGTM arriving).

Both event types execute the **default-branch** version of the workflow with repo
secrets — the secure pattern. The workflow calls only the `gh` API; it never checks
out or builds PR head code, so there is no untrusted-code-execution surface.

**Gate — all conditions must hold (re-evaluated idempotently on every fire):**

1. Head branch matches `renovate/*` **and** PR author is `renovate[bot]` — scopes
   the workflow to dependency bumps.
2. The PR carries the `<!-- breaking-bump:cleared -->` stamp **authored by
   `github-actions[bot]`** — the ai-gate-green signal. The author check prevents a
   human with PR-write access from forging the stamp.
3. Every entry in `statusCheckRollup` is `SUCCESS` / `NEUTRAL` / `SKIPPED` — none
   `PENDING` / `FAILURE` / `TIMED_OUT` / `CANCELLED`. (The automerge workflow's own
   run, if it surfaces as a check, is excluded.)
4. The latest `claude-review` (`github-actions[bot]`) review body starts with
   `LGTM` — read the body, not `reviewDecision`. **Prerequisite:** §6a was fully
   suppressed on `renovate/*`, so it posted no review there and this condition could
   never be met. We enable §6a **review-only** on `renovate/*` (run the reviewer, gate
   the fixer off) so dep-bump PRs get an LGTM/Findings review without §6a pushing to
   Renovate's branch (the Edited/Blocked deadlock ADR-0068 avoids). Side effect: §6a
   now reviews *all* open `renovate/*` PRs, bounded by its 5-review cap + LGTM-skip.
5. **No changed file is under `.github/workflows/`.** `github-action` minor/patch
   bumps edit the `uses: …@sha` pin in workflow files; auto-merging them would land
   a change on `main` (where workflows run with secrets) without a human click — a
   supply-chain surface ADR-0068's threat model keeps human-gated. This is a
   label-independent diff check, so it also catches any other workflow-touching
   bump. Such PRs still get the cleared stamp and wait for a manual merge.

If all hold → `gh pr merge <pr> --squash --delete-branch`. Otherwise no-op; a later
event re-fires and re-evaluates. If the PR is already MERGED/CLOSED, skip.

### Scope

Any allowlisted `>=1.x` **minor or patch** bump that reaches the `mergeable` route
(i.e. carries the cleared stamp), **except** bumps whose diff touches
`.github/workflows/` (see gate condition 5). Majors and any `0.x` bump never reach
this route (they go to the full A→D pipeline), so they are never auto-merged. No
other allowlist sub-scoping (not limited to frontend/dev-deps).

### Components and testability

The decision is pure logic, so it lives in a unit-tested
`scripts/breaking-bump/automerge.py`:

```
should_automerge(pr: dict) -> tuple[bool, str]   # (merge?, reason)
```

`pr` is the parsed `gh pr view --json state,author,headRefName,statusCheckRollup,
reviews,comments` payload. The workflow is thin glue: fetch JSON via `gh`, pipe to
the decider, merge when it returns `True`. This mirrors the existing
`routing.py` / `issue.py` pattern (logic in Python with tests; YAML is glue).

TDD the decider against the gate's truth table plus forge-resistance cases:
non-bot stamp author rejected, non-bot LGTM rejected, findings-not-LGTM body
rejected, a single non-green check rejected, non-`renovate/*` branch rejected,
non-`renovate[bot]` author rejected, a `.github/workflows/` file in the diff
rejected, already-merged/closed skipped, and the all-green happy path accepted.

### Companion edits

- `breaking-bump-dispatch.yml`: change the `Stamp mergeable` comment from "Safe to
  merge (human still clicks merge)" to state that auto-merge is armed (merges once
  CI is green and §6a posts LGTM).
- `docs/adr/0068-...md`: add an `Amendment 2026-06-14 — auto-merge of cleared
  minor/patch bumps` section documenting the new behavior, the gate, and the
  no-native-auto-merge rationale above.

### Error handling

- A `gh pr view` failure (transient) → the step exits non-zero for that fire; a
  later event re-fires. No partial merge.
- Mapping a `workflow_run` event to its PR: resolve via the run's `head_branch` +
  `head_sha`; if no open PR matches, no-op.
- Concurrency: `concurrency: automerge-pr-<number>` with `cancel-in-progress:false`
  serializes overlapping fires for the same PR, closing the double-merge window.

## Known trade-off (not solved in v1)

Rapid sequential auto-merges can cancel in-flight `deploy-frontend` / CI runs (the
dependency-cadence lesson — rapid merging cancels deploys). v1 merges per-PR as each
goes green, with no batching or quiet window (the §6a gate was chosen over the
quiet-window option). A future follow-up could add a merge queue or a minimum
spacing between auto-merges if deploy churn proves real.

## Delivery — three PR waves

1. **Wave 1 (governance):** the ADR-0068 amendment + this spec doc.
2. **Wave 1.5 (prerequisite):** enable §6a review-only on `renovate/*` in
   `claude-code-review.yml` (isolated PR — editing that workflow trips the
   self-edit review path, so its own review is handled manually).
3. **Wave 2 (implementation):** `breaking-bump-automerge.yml` + `automerge.py` +
   tests + the dispatcher comment edit. The workflow also re-evaluates on
   `breaking-bump-dispatch` completion so the cleared-stamp timing can't deadlock
   the gate.

## Out of scope

- Native auto-merge / branch protection (rejected above).
- Auto-merging majors or `0.x` bumps (always pipeline-routed).
- Batching / merge-queue / quiet-window cadence control (noted follow-up).
- Changing the `ai-gate` smell test or the allowlist.
