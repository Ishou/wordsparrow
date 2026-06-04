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

`dependency-review-action` gets `deny-licenses: GPL-2.0,
GPL-2.0-or-later, GPL-3.0, GPL-3.0-or-later, AGPL-3.0,
AGPL-3.0-or-later`. ADR-0058 codified the commercial-intent posture
for **data sources**; the same logic applies to runtime code
dependencies — a GPL-2.0/GPL-3.0 npm or Maven dependency bundled into
our shipped Docker image carries the same commercial-incompatibility
risk as a CC BY-NC training source. GPL-2.0 carries the same copyleft
contamination risk as GPL-3.0 for bundled runtime deps under commercial
intent; both versions are denied.

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
- A new npm dep brought in under GPL-2.0, GPL-3.0, or AGPL-3.0 fails CI before merge.
- Frontend code-injection / prototype-pollution patterns get a SAST
  pass.

**Harder:**
- First Trivy run will populate the Security tab with dozens of
  HIGH/MEDIUM findings; the maintainer absorbs a triage backlog.
- A genuinely-needed GPL-2.0 or GPL-3.0 dep requires an allowlist entry, not
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
