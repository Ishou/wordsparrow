# ADR-0068: AI-driven breaking-bump migration pipeline

## Status
Accepted — supersedes ADR-0067 (internal-tool upgrade-PR enrichment)

## Context
Renovate opens dependency-bump PRs. For bumps that need migration work (a major,
or any bump on a `0.x` dep), two things break: (1) the §6a review/fix cycle pushes
fixes onto Renovate's branch, which Renovate then marks "Edited/Blocked" —
deadlock; (2) a version bump and its migration are one logical change but must not
live on a Renovate-owned branch. ADR-0067 built a helm-only enrichment pipeline
(`helm-bump-enrich.yml`) that fetches release notes and posts migration context.
We now generalise that into a full, ecosystem-agnostic pipeline.

Full design: `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md`
(13 resolved open questions).

## Decision
A fully CI-native pipeline, **`breaking-bump`**, triggered from Renovate PRs:

- **Step 0 (deterministic, no AI)** routes each `renovate/*` PR: not-allowlisted →
  skip; `major` **or any `0.x` bump** → pipeline (per semver §4, at `0.x` both
  minor and patch may break, so they are treated exactly like a major); a `>=1.x`
  minor/patch → a cheap AI "smell test". An allowlist (signoz only, at first)
  gates the whole dispatcher.
- **The pipeline is a single GH issue-triggered workflow run** (the issue is the
  durable "spine"), with agents as `needs:`-chained `claude-code-action` jobs:
  **A** (doc gatherer, never reads code) → **B** (planner) ⇄ **C** (plan reviewer,
  bounded 6-round loop) → **D** (implementer: forks `chore/claude-<dep>-v<to>`, then
  closes the Renovate PR, opens a claude PR that hits the existing §6a cycle).
- **Ascending ratings** (B rates A, C rates B, §6a rates D); failures funnel to the
  spine issue (`needs-human`). The human merge of the claude PR is the safety net.
- **§6a is suppressed on `renovate/*`** (the clobber fix); it runs on the claude PR.
- Agent A **absorbs** `helm-bump-enrich` (ADR-0067) as a special case; the helm
  values-diff survives as a helm-only extra.

Naming/layout: scripts under `scripts/breaking-bump/`, workflows
`breaking-bump-{dispatch,,tests}.yml`, prompts `.github/breaking-bump/prompts/`,
five labels (`ai-driven`, `breaking-bump`, `post-bump-enhancement`, `needs-human`,
`ai-cleared`). Rollout is incremental, one dep at a time (signoz first).

## Consequences
- **Easier:** non-trivial dependency upgrades get grounded, reviewed migration
  attempts as ready-to-review PRs; the §6a/Renovate clobber is eliminated.
- **Harder / new surface:** more CI machinery and a multi-agent run per impacted
  bump; a token-cost surface bounded by the allowlist + per-bump caps. Treating
  every `0.x` patch as pipeline-eligible means more full runs for `0.x` deps —
  accepted (the allowlist bounds it; depth is the value).
- **Migration:** ADR-0067's helm-enrich pipeline is re-homed under Agent A, not
  deleted day one; `infra/tools-upgrade-sources.yaml` is kept (verified entries).
- This is a lab artifact intended to be reusable in other repos.

## Amendment 2026-06-13 — B'/amend convergence loop

The first dense major-bump live test (helm v3.21.0→v4.2.1) exposed a B↔C
non-convergence bug: each `b_round(N+1)` job downloaded only C's findings, **not
its own prior plan**, so Agent B regenerated the plan from scratch every round,
silently dropping coverage it had produced earlier. The loop burned all 6 rounds
and escalated to `needs-human` despite a correct plan existing by round 2.

Refinement: Agent B splits into **B (create, round 1)** and **B' (amend, rounds
2–6)**. B' downloads its prior `plan-round(N-1)`, amends it in place, and re-emits
the complete plan. C remains an **independent reviewer** (it amends nothing —
collapsing review and authorship would forfeit the adversarial check). A
deterministic plan-monotonicity guard runs after each B' round: every prior entry
(keyed `dispositions` and `a`/`b`/`c` action items) must persist or be recorded in
`_amendments.removed` with a reason; an unaccounted drop fails the round. `plan.json`
gains formalized `dispositions` + `_amendments` fields.

Design: `docs/superpowers/specs/2026-06-13-breaking-bump-b-amend-loop-design.md`.
