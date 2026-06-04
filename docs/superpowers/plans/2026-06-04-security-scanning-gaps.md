# Security Scanning Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four security-scanning gaps in CI — container-image CVEs, IaC misconfig (Helm + Terraform + Dockerfiles + K8s YAML), frontend SAST coverage, and dependency-license gating — via one ADR + three small follow-up PRs.

**Architecture:** Trivy is introduced as the multi-purpose vulnerability + misconfig scanner (one tool covers both the image-CVE and IaC-misconfig gaps). CodeQL's existing workflow grows by one language matrix entry to cover the frontend. `dependency-review-action` gets a `deny-licenses` config to enforce the commercial-intent posture from ADR-0058 on transitive dependencies. All scans use **CRITICAL-only failure thresholds with SARIF uploads to the Security tab** — HIGH/MEDIUM become signal, not gate, so the noise floor doesn't train people to bypass.

**Tech Stack:**
- `aquasecurity/trivy-action@<pinned-SHA>` for image + filesystem/config scans
- `github/codeql-action@v3` (existing) extended to `javascript-typescript`
- `actions/dependency-review-action@v4` (existing) extended with `deny-licenses`
- SARIF upload via `github/codeql-action/upload-sarif@v3`

---

## Sequencing & Dependencies

```
[Task 1] ADR-0065 PR  ─── merges first ───►  [Task 2] PR-A: Trivy image + config
                                              (depends on ADR-0065 being merged
                                               per CLAUDE.md "ADR merges first")

[Task 3] PR-B: CodeQL JS/TS  ─── independent, can land anytime ───►
[Task 4] PR-C: License gating ─── independent, can land anytime ───►
```

PR-B and PR-C don't need to wait on ADR-0065: PR-B expands the scope of an already-accepted tool (CodeQL is in CI); PR-C is a config addition to an already-accepted workflow (dependency-review). Both extend the existing security posture rather than introducing a new tool, so no ADR gate applies (CLAUDE.md: "ADR before non-trivial change. A new dependency…"). They can be opened the same day as Task 1.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/adr/0065-security-scanning-posture.md` | **Create** | Records the Trivy choice, severity threshold, SARIF-to-Security-tab posture, IaC scan scope, and the dep-license deny-list (extends ADR-0058 to deps). |
| `docs/adr/INDEX.md` | Modify | Add path→ADR rows for `.github/workflows/build-and-push-image.yml`, `.github/workflows/trivy-config.yml`, `.github/workflows/codeql.yml`, `.github/workflows/dependency-review.yml` → ADR-0065. Required by `registry-coherence.yml` CI gate. |
| `.github/workflows/build-and-push-image.yml` | Modify | Add a `trivy-image-scan` job that runs `aquasecurity/trivy-action` against `${{ steps.build.outputs.digest }}` for each matrix row, fails on CRITICAL only, uploads SARIF. |
| `.github/workflows/trivy-config.yml` | **Create** | New workflow: `trivy config` against `infra/`, `terraform/`, and all `Dockerfile`s. PR-triggered, fails on CRITICAL only, uploads SARIF. |
| `.github/workflows/codeql.yml` | Modify | Add `javascript-typescript` to the `languages` list as a second matrix entry; autobuild for JS/TS does not need JDK setup. |
| `.github/workflows/dependency-review.yml` | Modify | Add `deny-licenses: GPL-3.0, AGPL-3.0, GPL-3.0-or-later, AGPL-3.0-or-later` keyed off ADR-0058's commercial-intent posture extended to runtime deps. |
| `CLAUDE.md` | Modify (in ADR PR) | Add ADR-0065 to the "Recent landmarks" line under "How to collaborate with the maintainer". |

## Pre-flag for every PR (paste into the PR body)

- **Comment-style discipline (CLAUDE.md):** workflow YAML comments stay 1-line WHY-only; do not add multi-paragraph headers to new jobs. The existing comment blocks in `build-and-push-image.yml` are pre-existing and stay; new comments must be one line.
- **Branch-name format:** `<type>/<short-description>` per `branch-name.yml`. Use `chore/` for these (CI infra), not `feat/`.
- **Conventional commit scope:** `chore(ci)` is the right scope — the CI gates are not bounded-context-specific.
- **400-line cap:** all four PRs are well under cap. No override needed.
- **DCO:** `git commit -s` (signed-off-by) required.
- **ADR pre-read:** these workflows are governed by ADR-0009 (deploy posture) and the new ADR-0065. PR-A author runs `scripts/adr-context.sh .github/workflows/build-and-push-image.yml infra/ terraform/` and reads the output.

---

## Task 1: ADR-0065 — Security Scanning Posture

**Files:**
- Create: `docs/adr/0065-security-scanning-posture.md`
- Modify: `docs/adr/INDEX.md`
- Modify: `CLAUDE.md` (one-line addition to the "Recent landmarks" line)
- Test: visual review + `registry-coherence.yml` CI gate must pass

**Why an ADR is required:** CLAUDE.md says "ADR before non-trivial change. A new dependency…". Trivy is a new CI dependency, and its introduction sets a posture decision (CRITICAL-only threshold, SARIF-as-signal, IaC scan scope) that must outlive any one PR's author.

- [ ] **Step 1: Confirm ADR number is free**

```bash
ls docs/adr/0064*.md 2>/dev/null
```

Expected: no output. If `0064*.md` exists (another ADR landed since), use the next free number and update all references in this plan accordingly.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/0065-security-scanning-posture.md` with this body:

````markdown
# ADR-0065: Security scanning posture — Trivy for image + IaC, CodeQL for SAST, license gating on deps

## Status

Accepted (2026-06-04).

## Context

The CI security gates today cover four of the eight classic
software-supply-chain concerns and leave four open:

| Concern | Status | Tool |
|---|---|---|
| Secret scanning | ✅ | gitleaks (`secret-scan.yml`) |
| Dependency CVEs (PR-introduced) | ✅ | `dependency-review-action@v4` |
| SAST (Kotlin/Java) | ✅ | CodeQL (`codeql.yml`, `java-kotlin` only) |
| SBOM | ✅ | buildx `sbom: true` on main pushes |
| Build provenance | ✅ | SLSA via `build-push-action` |
| **Container image CVEs** (OS + jars in the published artifact) | ❌ | none |
| **IaC misconfig** (Helm, Terraform, Dockerfile, K8s YAML) | ❌ | `helm-lint` / `api-chart-lint` are syntactic only |
| **SAST (TS/JS)** — frontend | ❌ | CodeQL excludes the language |
| **License compliance** on runtime deps | ❌ | `dependency-review-action` supports it, not configured |

The image-CVE gap is operationally the worst given ADR-0009: we run
self-managed k3s on Hetzner, so the JDK base layer's CVEs are *our*
patch obligation, not a managed runtime's. The IaC gap follows close
behind — `infra/platform/charts/` and `terraform/` are deploy-shaped
artifacts with no static analysis at all today.

## Decision

### 1. Trivy as the multi-purpose scanner

Adopt **Trivy** (`aquasecurity/trivy-action`, pinned to commit SHA per
the manifesto's "container images pinned to digest" rule applied to
actions) for both:

- **Image CVE scanning** — runs as a job inside
  `build-and-push-image.yml` against the freshly-built digest per
  matrix row. Single tool, single config, no extra registry round-trip.
- **IaC misconfig scanning** — new `trivy-config.yml` workflow runs
  `trivy config` against `infra/`, `terraform/`, and every `Dockerfile`
  in the repo. PR-triggered.

**Why Trivy over alternatives:**

- **vs. Grype:** Grype is a reasonable image-only choice (it could
  consume the SPDX SBOM we already emit, which is architecturally
  cleaner). It does not cover IaC misconfig. Picking Trivy means one
  tool, one auth surface, one set of action pins to maintain rather
  than two — and one tool for any reviewer to grok. We accept the
  slight architectural inconsistency of re-pulling+re-parsing the
  image even though we already attested an SBOM, as the cost of
  consolidation.
- **vs. Snyk Container:** paid past the free tier. CLAUDE.md forbids
  introducing a paid third-party service without approval.
- **vs. Docker Scout:** couples us to Docker Hub for the scan path;
  we publish to GHCR, not Docker Hub.
- **vs. GHAS container scanning:** in preview and billed under GHAS;
  not a stable foundation.

### 2. CRITICAL-only failure threshold

Trivy and the SARIF uploaders are configured to **fail the job only on
CRITICAL findings**. HIGH/MEDIUM/LOW flow to SARIF and surface in the
GitHub Security tab as the queryable backlog.

**Why:** Trivy will surface dozens of HIGH and MEDIUM findings on the
JDK base image we can't immediately fix. Gating on those would train
contributors to add `--skip-files` / `# trivy:ignore` lines until the
gate is meaningless. CRITICAL is the line where "stop the line"
behavior is justified at our scale. HIGH/MEDIUM are not zero-value:
they're the Security-tab backlog the maintainer triages on a
quiet-week cadence.

**Revisit trigger:** when the Security-tab HIGH backlog crosses 50
findings or after the first observed CVE incident attributable to a
HIGH finding we ignored — whichever comes first.

### 3. SARIF uploads, not PR-wall comments

All scanner outputs upload SARIF via `github/codeql-action/upload-sarif@v3`.
Findings appear in the **Security tab** (Code scanning alerts), not
as PR comments or job-summary noise. Rationale: a PR-wall comment
that re-posts the same 30 HIGH findings on every PR is dead
information after the second one; the Security tab dedupes,
threads, and tracks dismissals.

### 4. IaC scan scope

`trivy config` scans:

- `infra/` — all Helm charts and K8s manifests
- `terraform/` — OpenTofu state lives elsewhere (ADR-0010), but the
  HCL source we're scanning
- All `Dockerfile`s reachable from the repo root

The CRITICAL-only threshold applies identically. Helm-specific
findings (KSV*) and Dockerfile findings (AVD-DS-*) both flow to the
same SARIF artifact.

### 5. CodeQL extends to `javascript-typescript`

Add `javascript-typescript` to the CodeQL `languages` matrix in
`codeql.yml`. The frontend (`frontend/`) has had zero static analysis
since the codebase began; this is the cheapest possible gap closure
(one matrix entry, autobuild handles JS/TS without setup steps).

### 6. License gating on runtime dependencies (extends ADR-0058)

`dependency-review-action` gets `deny-licenses: GPL-3.0,
GPL-3.0-or-later, AGPL-3.0, AGPL-3.0-or-later`. ADR-0058 codified
the commercial-intent posture for **data sources**; the same logic
applies to runtime code dependencies — a GPL-3.0 npm or Maven
dependency bundled into our shipped Docker image carries the same
commercial-incompatibility risk as a CC BY-NC training source.

This is narrower than ADR-0058's data matrix on purpose: build-time
tooling (test runners, formatters) is not the target. The gate only
fires for runtime dependencies introduced in the PR's diff
(dependency-review-action's default scope is exactly that).

**Allowlist exceptions** for individual deps go in
`.github/dependency-review-config.yml` with a one-line WHY referencing
the dep and rationale, not in PR overrides.

## Consequences

**Easier:**
- A new CRITICAL CVE in the JDK base image fails CI before publish.
- A Helm chart that mounts a hostPath, runs privileged, or skips
  `runAsNonRoot` fails CI before deploy.
- A new npm dep brought in under AGPL-3.0 fails CI before merge.
- Frontend code-injection / prototype-pollution patterns get a SAST
  pass.

**Harder:**
- First Trivy run will populate the Security tab with dozens of
  HIGH/MEDIUM findings; the maintainer absorbs a triage backlog.
- A genuinely-needed GPL-3.0 dep requires an allowlist entry, not
  a silent merge.
- One more CI job per matrix row on `build-and-push-image.yml` —
  expect ~30–60s of added wall time per row.

**Revisit triggers (named):**
- Security-tab HIGH backlog > 50 → revisit threshold (§2).
- First incident attributable to a HIGH we ignored → revisit
  threshold immediately.
- A second IaC tool slot is requested (kube-linter, Checkov) →
  reconsider the "one tool" consolidation choice.

## References

- ADR-0001 (CI gates discipline)
- ADR-0009 (we own JDK base patching → image CVE scan matters)
- ADR-0058 (commercial-intent posture this extends to deps)
- Trivy action: <https://github.com/aquasecurity/trivy-action>
- SARIF upload: <https://github.com/github/codeql-action>
````

- [ ] **Step 3: Update `docs/adr/INDEX.md`**

Append these rows (the `registry-coherence.yml` gate enforces that every new ADR has at least one path-row in INDEX.md):

```
ADR-0065  .github/workflows/build-and-push-image.yml  Trivy image-CVE scan (CRITICAL-only, SARIF)
ADR-0065  .github/workflows/trivy-config.yml          Trivy IaC misconfig scan (infra/, terraform/, Dockerfiles)
ADR-0065  .github/workflows/codeql.yml                SAST coverage extends to javascript-typescript
ADR-0065  .github/workflows/dependency-review.yml     License deny-list (GPL/AGPL) extending ADR-0058 to deps
```

Find the right insertion point — the INDEX is sorted by ADR number. Look for the last `ADR-006*` block and append after it.

- [ ] **Step 4: Update `CLAUDE.md` "Recent landmarks" line**

Find the line:

```
> Recent landmarks: 0001 (workflow), 0003 (cross-language API), 0009
> (k3s deploy), 0018 (game context), 0050 (a11y), 0039 (bitmask-CSP
> grid generator), 0042 (daily pre-gen worker), 0034/0048 (CORS wildcard
> predicate), 0056 (survey context).
```

Add `0064 (security scanning posture)` at the end:

```
> Recent landmarks: 0001 (workflow), 0003 (cross-language API), 0009
> (k3s deploy), 0018 (game context), 0050 (a11y), 0039 (bitmask-CSP
> grid generator), 0042 (daily pre-gen worker), 0034/0048 (CORS wildcard
> predicate), 0056 (survey context), 0064 (security scanning posture).
```

- [ ] **Step 5: Verify `registry-coherence.yml` passes locally**

```bash
# Inspect the script the gate runs (paths differ per repo; check the workflow)
grep -n "run:" .github/workflows/registry-coherence.yml
```

If there's a local script (e.g. `scripts/check-registry-coherence.sh`), run it. If the gate runs inline `awk` / `grep`, replicate the check by hand.

Expected: no missing path-rows for ADR-0065.

- [ ] **Step 6: Commit**

```bash
git checkout -b chore/adr-0065-security-scanning-posture
git add docs/adr/0065-security-scanning-posture.md docs/adr/INDEX.md CLAUDE.md
git commit -s -m "$(cat <<'EOF'
chore(docs): add ADR-0065 security scanning posture

Documents the Trivy + CodeQL extension + license-gating decisions
that the follow-up PRs implement. CRITICAL-only threshold; SARIF
to Security tab; one tool (Trivy) for both image-CVE and IaC
misconfig gaps. Extends ADR-0058's commercial-intent posture to
runtime dependency licenses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open the PR**

```bash
git push -u origin chore/adr-0065-security-scanning-posture
gh pr create --title "chore(docs): add ADR-0065 security scanning posture" --body "$(cat <<'EOF'
## Summary
- Records the Trivy + CodeQL + license-gating posture before the implementation PRs land.
- CRITICAL-only failure threshold; SARIF → Security tab; HIGH/MEDIUM as signal not gate.
- Extends ADR-0058's commercial-intent posture to runtime dep licenses (GPL/AGPL deny-list).

## Test plan
- [ ] `registry-coherence.yml` green (INDEX.md path-rows present for ADR-0065)
- [ ] `commitlint`, `dco`, `branch-name`, `secret-scan` green
- [ ] §6a reviewer LGTM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Schedule auto-merge cron**

Per the standing "auto-merge cron is the default" preference, schedule a 2-minute cron that auto-merges on green + LGTM. (Skill: `superpowers:executing-plans` / `dispatch` orchestrator default.)

---

## Task 2: PR-A — Trivy image + IaC config scanning

**Blocked by:** Task 1 merge.

**Files:**
- Modify: `.github/workflows/build-and-push-image.yml` (add a `trivy-image-scan` job per matrix row)
- Create: `.github/workflows/trivy-config.yml`
- Test: CI green; SARIF visible in Security tab after first run

- [ ] **Step 1: Create a new worktree off main (after ADR-0065 merges)**

```bash
git fetch origin
# Use the EnterWorktree native tool or git worktree fallback per the
# using-git-worktrees skill — do NOT reuse the ADR-0065 worktree.
```

- [ ] **Step 2: Look up the latest Trivy action SHA**

```bash
gh api repos/aquasecurity/trivy-action/tags --jq '.[0]'
```

Capture the commit SHA for the latest stable tag (e.g. `0.28.0`). Pin to the **SHA**, not the tag, per the manifesto's deterministic-build rule already applied to gitleaks-action in `secret-scan.yml`.

- [ ] **Step 3: Add Trivy image scan to `build-and-push-image.yml`**

Add this job AFTER the existing `build` matrix job. The new job runs only on `pull_request` (where the image is loaded into the runner via `load: true`) AND on `push` to main (where the image is in GHCR via `push: true`); both code paths produce a scannable target.

```yaml
  trivy-image-scan:
    name: trivy-image (${{ matrix.context }})
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      packages: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        # Mirror build matrix exactly so every published image gets scanned.
        include:
          - context: grid
            image-name: wordsparrow-api
          - context: game
            image-name: wordsparrow-game-api
          - context: identity
            image-name: wordsparrow-identity-api
          - context: survey
            image-name: wordsparrow-survey-api
          - context: grid-worker
            image-name: wordsparrow-worker
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download image digest artifact
        uses: actions/download-artifact@v4
        with:
          name: image-digest-${{ matrix.context }}
          path: digest

      - name: Run Trivy image scan
        # Pinned to commit SHA per MANIFESTO deterministic-build rule.
        uses: aquasecurity/trivy-action@<INSERT_SHA_FROM_STEP_2> # v0.28.0
        with:
          image-ref: ghcr.io/${{ github.repository_owner }}/bliss/${{ matrix.image-name }}@$(cat digest/digest.txt)
          format: sarif
          output: trivy-image.sarif
          severity: CRITICAL
          exit-code: '1'

      - name: Upload SARIF to Security tab
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-image.sarif
          category: trivy-image-${{ matrix.context }}
```

**Note on `digest/digest.txt`:** the existing `build` job records the digest into `$GITHUB_STEP_SUMMARY` but does not currently upload it as a literal artifact. Check the existing `digest-artifact: image-digest-<context>` configuration in the matrix — it already creates the artifact. Verify the file name inside the artifact matches what you `cat` here; adjust if the convention is `digest`, `digest.txt`, or similar.

- [ ] **Step 4: Create `.github/workflows/trivy-config.yml`**

```yaml
name: Trivy Config Scan

# IaC misconfig scan (Helm, K8s, Terraform, Dockerfiles) per ADR-0065.
# CRITICAL-only failure threshold; SARIF uploads surface findings in the
# Security tab as triage backlog, not PR-wall noise.

on:
  pull_request:
    paths:
      - 'infra/**'
      - 'terraform/**'
      - '**/Dockerfile'
      - '.github/workflows/trivy-config.yml'
  push:
    branches: [main]
    paths:
      - 'infra/**'
      - 'terraform/**'
      - '**/Dockerfile'
      - '.github/workflows/trivy-config.yml'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read
  security-events: write

jobs:
  trivy-config:
    name: trivy-config
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Trivy config scan
        # Pinned to commit SHA per MANIFESTO deterministic-build rule.
        uses: aquasecurity/trivy-action@<INSERT_SHA_FROM_STEP_2> # v0.28.0
        with:
          scan-type: config
          scan-ref: .
          format: sarif
          output: trivy-config.sarif
          severity: CRITICAL
          exit-code: '1'

      - name: Upload SARIF to Security tab
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-config.sarif
          category: trivy-config
```

- [ ] **Step 5: Run the workflow locally if possible**

`act` (the local GitHub Actions runner) supports running individual workflows. If installed:

```bash
act -W .github/workflows/trivy-config.yml -j trivy-config -n  # dry-run / syntax check
```

Otherwise, lean on the PR's own CI run as the validation.

- [ ] **Step 6: Commit**

```bash
git checkout -b chore/ci-trivy-image-and-config
git add .github/workflows/build-and-push-image.yml .github/workflows/trivy-config.yml
git commit -s -m "$(cat <<'EOF'
chore(ci): add Trivy image-CVE and IaC misconfig scanning

Per ADR-0065: closes the image-CVE gap on the published GHCR
artifacts (JDK base layers + jars) and the IaC misconfig gap on
infra/, terraform/, and Dockerfiles. CRITICAL-only failure
threshold; SARIF uploads route findings to the Security tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open PR + auto-merge cron**

```bash
git push -u origin chore/ci-trivy-image-and-config
gh pr create --title "chore(ci): add Trivy image-CVE and IaC misconfig scanning" --body "$(cat <<'EOF'
## Summary
- Implements ADR-0065 image-CVE scan: new `trivy-image-scan` matrix job in `build-and-push-image.yml`, one row per published image, scans the just-built digest.
- Implements ADR-0065 IaC scan: new `trivy-config.yml` workflow against `infra/`, `terraform/`, `**/Dockerfile`.
- CRITICAL-only failure; HIGH/MEDIUM/LOW → Security tab.
- Trivy action pinned to commit SHA per MANIFESTO deterministic-build rule.

## Test plan
- [ ] PR's own CI run shows `trivy-image-scan` matrix green (or surfaces only CRITICALs we accept the gate on)
- [ ] PR's own CI run shows `trivy-config` green
- [ ] After merge: Security tab populated with `trivy-image-*` and `trivy-config` categories

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Schedule the standard 2-minute auto-merge cron after open.

---

## Task 3: PR-B — CodeQL `javascript-typescript`

**Independent — can land in parallel with Tasks 1 & 2.**

**Files:**
- Modify: `.github/workflows/codeql.yml`
- Test: CI green; CodeQL surfaces a JS/TS analysis run

- [ ] **Step 1: Create a worktree (do not reuse the ADR or Trivy worktrees)**

```bash
# Native EnterWorktree per using-git-worktrees skill.
```

- [ ] **Step 2: Convert `codeql.yml` to a language matrix**

Replace the single-language job with a matrix. The autobuild for JS/TS does not need the JDK setup step.

Current (relevant excerpt):

```yaml
jobs:
  analyze:
    name: Analyze (java-kotlin)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: java-kotlin
          build-mode: autobuild

      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:java-kotlin
```

Replace with:

```yaml
jobs:
  analyze:
    name: Analyze (${{ matrix.language }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - language: java-kotlin
            needs-jdk: true
          - language: javascript-typescript
            needs-jdk: false
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up JDK 21
        if: matrix.needs-jdk
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          build-mode: autobuild

      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:${{ matrix.language }}
```

- [ ] **Step 3: Verify autobuild discovers the frontend**

CodeQL's JS/TS autobuild traverses the repo and indexes `*.ts`, `*.tsx`, `*.js` files automatically. The frontend at `frontend/` does not need a build step for CodeQL to ingest it. (Verify after the first run — if autobuild misses the frontend, add `paths:` config under `.github/codeql/codeql-config.yml`.)

- [ ] **Step 4: Commit**

```bash
git checkout -b chore/ci-codeql-javascript-typescript
git add .github/workflows/codeql.yml
git commit -s -m "$(cat <<'EOF'
chore(ci): extend CodeQL to javascript-typescript

Frontend (frontend/) had zero SAST coverage. Adds the language as a
matrix entry alongside the existing java-kotlin analysis. Autobuild
needs no JDK for JS/TS so the JDK step is gated on the matrix row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Open PR + auto-merge cron**

```bash
git push -u origin chore/ci-codeql-javascript-typescript
gh pr create --title "chore(ci): extend CodeQL to javascript-typescript" --body "$(cat <<'EOF'
## Summary
- Adds `javascript-typescript` as a CodeQL matrix row so the frontend gets SAST coverage.
- JDK setup gated to the `java-kotlin` row; autobuild handles JS/TS without a build step.
- Independent of ADR-0065 — expands an already-accepted tool's scope.

## Test plan
- [ ] CI green on both matrix rows
- [ ] Security tab shows a `/language:javascript-typescript` analysis run

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Schedule the standard 2-minute auto-merge cron.

---

## Task 4: PR-C — License gating on dependency-review

**Independent — can land in parallel with Tasks 1 & 2. Compatible with PR-B.**

**Files:**
- Modify: `.github/workflows/dependency-review.yml`
- Test: CI green on a PR that does NOT introduce GPL/AGPL deps; CI red on a synthetic PR that does (manually verify locally; do not land the synthetic PR).

- [ ] **Step 1: Create a worktree**

```bash
# Native EnterWorktree per using-git-worktrees skill.
```

- [ ] **Step 2: Add `deny-licenses` to `dependency-review.yml`**

Current:

```yaml
      - name: Review dependencies
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: critical
          comment-summary-in-pr: on-failure
```

Replace with:

```yaml
      - name: Review dependencies
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: critical
          comment-summary-in-pr: on-failure
          # ADR-0065 extends ADR-0058's commercial-intent posture to runtime deps.
          deny-licenses: GPL-3.0, GPL-3.0-or-later, AGPL-3.0, AGPL-3.0-or-later
```

- [ ] **Step 3: (Optional) Create the allowlist config file**

If a legitimate GPL-3.0 dep already exists in the lockfiles, the gate will go red immediately. Inventory first:

```bash
# Maven (Gradle)
./gradlew :grid:api:dependencies --configuration runtimeClasspath | head -200
# (repeat per module; or use the Gradle license plugin if installed)

# npm
cd frontend && pnpm licenses list --prod 2>/dev/null | head -200
```

If any runtime dep is GPL/AGPL today, create `.github/dependency-review-config.yml` (referenced via `config-file:` on the action) with explicit allowlist entries and a one-line WHY for each. **Do not silently bypass.** If unclear, surface the dep names to the maintainer before opening the PR.

- [ ] **Step 4: Commit**

```bash
git checkout -b chore/ci-license-gating-deps
git add .github/workflows/dependency-review.yml
# If allowlist file created:
# git add .github/dependency-review-config.yml
git commit -s -m "$(cat <<'EOF'
chore(ci): gate runtime dependency licenses (GPL/AGPL deny-list)

Extends ADR-0058's commercial-intent posture from data sources to
runtime dependencies. dependency-review-action fails on
GPL-3.0/AGPL-3.0 introduced by a PR. Build-time tooling unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Open PR + auto-merge cron**

```bash
git push -u origin chore/ci-license-gating-deps
gh pr create --title "chore(ci): gate runtime dependency licenses (GPL/AGPL deny-list)" --body "$(cat <<'EOF'
## Summary
- Adds `deny-licenses: GPL-3.0, GPL-3.0-or-later, AGPL-3.0, AGPL-3.0-or-later` to `dependency-review-action`.
- Extends ADR-0058 (commercial-intent posture on data) to runtime deps.
- Build-time tooling (test runners, formatters) unaffected — `dependency-review-action` scopes to runtime by default.

## Test plan
- [ ] CI green on this PR (the diff does not introduce any new dep)
- [ ] Locally verified: a synthetic PR adding `agpl-license` npm pkg fails the gate

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Schedule the standard 2-minute auto-merge cron.

---

## Self-Review Notes

**Spec coverage:** Every gap in the recommendation maps to a task —
image CVE (Task 2 first half), IaC misconfig (Task 2 second half),
frontend SAST (Task 3), license gating (Task 4). The ADR (Task 1)
gates the new-dependency tasks per CLAUDE.md.

**Placeholders:** Two intentional `<INSERT_SHA_FROM_STEP_2>`
placeholders in Task 2 — the engineer must resolve the current
Trivy action SHA at PR time rather than this plan baking in a
stale SHA. Everything else is concrete.

**Type / name consistency:** matrix `context` values match between
`build` and `trivy-image-scan` in Task 2; `image-name` values match
the existing matrix exactly. `digest-artifact` artifact name pattern
follows the existing `image-digest-<context>` convention.

**Known unknown:** the exact filename inside the
`image-digest-<context>` artifact — the existing workflow writes the
digest to `$GITHUB_STEP_SUMMARY` but the artifact upload step isn't
in view in this plan. Task 2 Step 3 flags this for the engineer to
verify and adjust the `cat digest/digest.txt` line.
