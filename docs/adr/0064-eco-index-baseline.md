# ADR-0064: EcoIndex baseline via Lighthouse CI

## Status

Proposed

## Context

The MANIFESTO names sustainability among the product's non-functional
requirements; ADR-0050 set the a11y baseline as a binding CI gate.
There is no equivalent gate for the page-weight / environmental
footprint of the frontend. Without one, regressions (a 2 MB hero
image, an unused tracking SDK) ship silently until a manual audit
catches them.

The Collectif Numérique Responsable (CNumR) publishes **EcoIndex**, a
French-origin methodology that scores a page on three measured
indicators — DOM size, HTTP request count, transferred bytes — and
maps them to a letter grade A→G with associated CO₂eq / water
estimates. Methodology source:
<https://www.ecoindex.fr/en/methodology/>.

Tool landscape (June 2026):

- **GreenIT-Analysis CLI** (`cnumr/GreenIT-Analysis-cli`) — Puppeteer
  wrapper around the Chrome extension. Faithful to the canonical
  extension score, but has no built-in threshold gate; failure logic
  lives in a third-party GitHub Action that wraps a community Docker
  image. Two indirections away from the score.
- **`ecoindex-cli`** (Python) — being archived in favor of
  `ecoindex_python_fullstack`. Not adopting a sunsetting tool.
- **Lighthouse EcoIndex plugin** (`cnumr/lighthouse-plugin-ecoindex`)
  — same EcoIndex methodology, exposed as a Lighthouse plugin.
  Integrates with Lighthouse CI's assertion engine for first-class
  threshold gates. Maintained as of 2026-06.
- **Ecograder / Website Carbon Calculator** — web UIs, no CI story.
- **`ec0lint`** — static eco-design linter. Complementary, not a
  replacement.

## Decision

### 1. Tool

Adopt the Lighthouse EcoIndex plugin run through `@lhci/cli`. Config
lives at `frontend/lighthouserc.cjs`; threshold assertions live in
the same file.

This is **not** a reversal of ADR-0050 §1's rejection of Lighthouse
CI for a11y. ADR-0050 rejected Lighthouse *as an a11y tool* because
its a11y category overlaps with `@axe-core/playwright`. This ADR uses
Lighthouse only as the harness for the EcoIndex plugin and (as a
secondary benefit) the performance category. The Lighthouse
**accessibility category is disabled** in `lighthouserc.cjs` —
`@axe-core/playwright` remains the canonical a11y gate per ADR-0050.

### 2. Routes audited

Three representative pre-rendered routes (matches
`scripts/prerender.ts` PUZZLE_LOADING_ROUTES + the contributor flow):

- `/` — landing
- `/grille` — solo puzzle (heaviest grid route)
- `/contribuer` — contributor survey (heaviest form route)

The grid bundle is the dominant frontend payload; if EcoIndex
regresses on `/grille`, the gate fires. Other routes get added as
follow-up PRs as they stabilize.

### 3. Thresholds (initial)

| Assertion                       | Initial level | Initial threshold |
|---------------------------------|---------------|-------------------|
| `plugins/ecoindex/score`        | `warn`        | ≥ 70 (grade B)    |
| `categories/performance`        | `warn`        | ≥ 0.85            |
| `categories/accessibility`      | `off`         | n/a — axe canonical (ADR-0050) |
| `categories/best-practices`     | `warn`        | ≥ 0.90            |
| `categories/seo`                | `warn`        | ≥ 0.90            |

Rationale for `warn`-first: identical to ADR-0050's `moderate`-tier
treatment — the first 60 days establish a baseline against real
traffic and let one round of cleanup land before the gate becomes
merge-blocking. This ADR commits to **ratcheting EcoIndex and
performance to `error` within 60 days** of merge, reviewed at the
next quarterly manifesto check. The ratchet PR amends this ADR's §3.

### 4. Target URLs by trigger

| Trigger                              | Audited host                       |
|--------------------------------------|------------------------------------|
| `push` to `main` (post-deploy)       | `https://wordsparrow.io`           |
| `pull_request` (post-preview-deploy) | `<branch>.bliss.pages.dev`         |
| `workflow_dispatch`                  | URL input (defaults to prod)       |
| `schedule` (nightly 04:00 UTC)       | `https://wordsparrow.io`           |

The Pages preview URL is passed from `deploy-frontend.yml` to
`lighthouse.yml` as a workflow-artifact handoff. Preview audits run
against the MSW-mocked build (`.env.preview`); they catch
bundle-weight regressions but cannot catch API-driven payload
regressions. Nightly prod audits close that gap.

### 5. CI workflow

New workflow: `.github/workflows/lighthouse.yml`.

- Triggered by `workflow_run` on the Deploy Frontend workflow's
  successful completion, plus `workflow_dispatch` and `schedule`.
- Initial `warn`-level assertions mean a regression posts a comment
  but does not fail the workflow. Once §3 ratchets to `error`, the
  job's exit code becomes the merge gate (added to CLAUDE.md CI gates
  in the ratchet PR).
- Runs after Deploy Frontend so the preview is reachable.
- Checks out `main` (not the PR's head_sha) — the workflow holds
  `pull-requests: write` to post comments, and running PR-supplied
  code under that permission is the classic "pwn request" pattern.
  The audited URL is validated against an allowlist before lhci sees
  it.

### 6. What this ADR does *not* do

- It does not introduce a runtime carbon-measurement library or any
  user-facing eco-mode toggle.
- It does not change the Lighthouse a11y status — `@axe-core/playwright`
  (ADR-0050) remains the only a11y gate. Lighthouse's a11y category is
  explicitly disabled to avoid double-running an inferior axe build.
- It does not retroactively grade old PRs. The baseline is "wherever
  `main` is on the merge date of this ADR".

## Consequences

- Page-weight regressions surface in CI within minutes of preview
  deploy, on the PR that caused them.
- One more workflow on the critical path post-deploy; runtime
  budgeted at ≤ 4 minutes for three routes.
- Once §3 ratchets to `error`, adding a heavy dependency to the
  frontend bundle requires either (a) a justification in the PR body,
  or (b) an ADR amendment relaxing the threshold.
- The new dependency on `@lhci/cli` and `lighthouse-plugin-ecoindex`
  ages with the Lighthouse release cadence; if the plugin stops
  tracking Lighthouse upstream, fall back to GreenIT-Analysis-cli
  with a Docker pin (documented as a backup in this ADR).
