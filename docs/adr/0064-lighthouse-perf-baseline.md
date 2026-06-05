# ADR-0064: Lighthouse performance baseline (EcoIndex deferred under ADR-0065 AGPL deny-list)

## Status

Accepted

> **ADR-0001 §7 deviation note:** This ADR is merged in the same PR as the
> implementation. The design direction (Lighthouse CI as the harness, warn-first
> assertions, 60-day ratchet) was settled before code was written.

## Context

The MANIFESTO names performance and sustainability among the product's
non-functional requirements. ADR-0050 set the a11y baseline as a binding
CI gate. There is no equivalent gate for the page-weight / performance
budget of the frontend — regressions ship silently until a manual audit
catches them.

This ADR originally proposed adopting the Lighthouse EcoIndex plugin
(`lighthouse-plugin-ecoindex`) to land both a performance budget and a
CNumR EcoIndex score in one gate. During CI for PR #759,
`dependency-review` (introduced by ADR-0065 the day before) blocked the
merge: every package in the plugin's tree
(`lighthouse-plugin-ecoindex`, `-core`, `-courses`) is licensed
**AGPL-3.0-only**, and ADR-0065's deny-list covers AGPL.

ADR-0065's deny-list is intentionally mechanical — easier to enforce
than per-package "is this linked, distributed, or modified?" judgments,
and it keeps the lockfile clean for future acquisition / due-diligence
reviews. The plugin's actual usage in this PR (CI-only, separate
process, never bundled, never modified) likely would not trigger AGPL
§13 obligations in practice, but a narrow allowlist carve-out would
weaken ADR-0065 within days of its merge.

This ADR therefore re-scopes to a perf-only Lighthouse baseline.
EcoIndex is deferred until a license-compliant scorer exists.

## Decision

### 1. Tool

Adopt `@lhci/cli` (MIT) for a perf + best-practices + SEO budget on
representative routes. No EcoIndex plugin in the dep graph.

This is **not** a reversal of ADR-0050 §1's rejection of Lighthouse CI
for a11y. ADR-0050 rejected Lighthouse *as an a11y tool* because its
a11y category overlaps with `@axe-core/playwright`. The Lighthouse
**accessibility category is disabled** in `lighthouserc.cjs` —
`@axe-core/playwright` remains the canonical a11y gate per ADR-0050.

### 2. Routes audited

Three representative pre-rendered routes (matches `scripts/prerender.ts`
PUZZLE_LOADING_ROUTES + the contributor flow):

- `/` — landing
- `/grille` — solo puzzle (heaviest grid route)
- `/contribuer` — contributor survey (heaviest form route)

### 3. Thresholds (initial)

| Assertion                       | Initial level | Initial threshold |
|---------------------------------|---------------|-------------------|
| `categories/performance`        | `warn`        | ≥ 0.85            |
| `categories/best-practices`     | `warn`        | ≥ 0.90            |
| `categories/seo`                | `warn`        | ≥ 0.90            |
| `categories/accessibility`      | `off`         | n/a — axe canonical (ADR-0050) |

Rationale for `warn`-first: identical to ADR-0050's `moderate`-tier
treatment — the first 60 days establish a baseline against real traffic
and let one round of cleanup land before the gate becomes
merge-blocking. This ADR commits to **ratcheting performance to
`error` within 60 days** of merge, reviewed at the next quarterly
manifesto check. The ratchet PR amends this ADR's §3.

### 4. Target URLs by trigger

| Trigger                              | Audited host                       |
|--------------------------------------|------------------------------------|
| `push` to `main` (post-deploy)       | `https://wordsparrow.io`           |
| `pull_request` (post-preview-deploy) | `<branch>.bliss.pages.dev`         |
| `workflow_dispatch`                  | URL input (defaults to prod)       |
| `schedule` (nightly 04:00 UTC)       | `https://wordsparrow.io`           |

The Pages preview URL is passed from `deploy-frontend.yml` to
`lighthouse.yml` as a workflow-artifact handoff. Preview audits run
against the MSW-mocked build (`.env.preview`); they catch bundle-weight
regressions but cannot catch API-driven payload regressions. Nightly
prod audits close that gap.

### 5. CI workflow

New workflow: `.github/workflows/lighthouse.yml`.

- Triggered by `workflow_run` on the Deploy Frontend workflow's
  successful completion, plus `workflow_dispatch` and `schedule`.
- Initial `warn`-level assertions mean a regression posts a comment
  but does not fail the workflow. Once §3 ratchets to `error`, the
  job's exit code becomes the merge gate (added to CLAUDE.md CI gates
  in the ratchet PR).
- Checks out `main` (not the PR's `head_sha`) — the workflow holds
  `pull-requests: write` to post comments, and running PR-supplied
  code under that permission is the classic "pwn request" pattern.
  The audited URL is validated against an allowlist before lhci sees
  it.

### 6. EcoIndex — deferred

Re-evaluate when one of the following holds:

- CNumR or a third party publishes a permissively-licensed EcoIndex
  scorer (MIT/Apache/BSD).
- A Docker-isolated CI integration of the existing AGPL plugin is
  designed that keeps the AGPL boundary outside the npm dep graph
  (no entry in `pnpm-lock.yaml`), and an amendment to this ADR
  documents that the AGPL boundary is honored.

Until then, page weight is observable via the Lighthouse perf score
(weight-sensitive Core Web Vitals are weighted heavily) but not
formally scored on the EcoIndex scale.

### 7. What this ADR does *not* do

- It does not introduce a runtime carbon-measurement library or any
  user-facing eco-mode toggle.
- It does not change the Lighthouse a11y status — `@axe-core/playwright`
  (ADR-0050) remains the only a11y gate.

## Consequences

- Performance regressions surface in CI within minutes of preview
  deploy, on the PR that caused them.
- One more workflow on the critical path post-deploy; runtime
  budgeted at ≤ 4 minutes for three routes.
- Once §3 ratchets to `error`, adding a heavy dependency to the
  frontend bundle requires either (a) a justification in the PR body,
  or (b) an ADR amendment relaxing the threshold.
- ADR-0065's AGPL deny-list remains intact at the lockfile perimeter;
  no carve-out is needed.
- The eco-design signal is degraded from a precise EcoIndex grade to
  a perf-correlated proxy; revisit per §6.
