# Helm bump enrichment — design

**Date:** 2026-06-11
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/helm-bump-enrich`

## Problem

In-cluster internal tools (SigNoz + `k8s-infra`, the five platform operators,
matomo, nats) are pinned as Helm subchart dependencies in `infra/**/Chart.yaml`.
Renovate already opens mechanical bump PRs for these on its Monday "helm
subcharts" schedule, but a bare bump PR forces the maintainer to do the upgrade
homework by hand: read the upstream release notes, find the breaking changes,
and diff the chart's default `values.yaml` to see what config the override files
(`values-prod.yaml`) must reconcile.

We want each helm-bump PR to arrive **enriched** with that homework already
done, so the maintainer reviews and merges with full context. Deploy stays
manual (the operator runs `helm upgrade` after merge, exactly as today).

## Scope

**In scope (v1):**
- All `renovate/` PRs that bump a subchart version in any `infra/**/Chart.yaml`:
  SigNoz (`signoz`, `k8s-infra`), platform operators (`cert-manager`,
  `ingress-nginx`, `external-dns`, `cloudnative-pg`, `hcloud-csi`), matomo, nats.
- Append to the existing Renovate PR body: the version delta, synthesized
  migration notes from official release docs, and the upstream default
  `values.yaml` diff between old and new versions.

**Out of scope (v1):**
- Deploy automation. `helm upgrade` for these charts remains a manual operator
  step (`docs/deploy.md`). A deploy-on-merge workflow is a possible later
  project; this design does not build it.
- Owning the mechanical bump. Renovate keeps editing `Chart.yaml` / `Chart.lock`
  and computing the lockfile digest. The agent only adds the intelligence layer.
- Auto-merge. A human reviews and merges every enriched PR.

## Decisions (from brainstorm)

1. **PR-only.** No prod access, no deploy. Lowest blast radius.
2. **Augment Renovate, don't replace it.** Renovate is battle-tested at the
   mechanical bump + lockfile digest + grouping. The agent enriches its open
   PRs; no duplicate PRs.
3. **All helm subcharts** in scope from day one. Enrichment quality varies by
   how good each upstream's release docs are; the design degrades gracefully
   when docs are missing (see Error handling).
4. **Event-driven + cron safety net.** Enrich on `pull_request: opened` within
   minutes; a daily cron sweeps open renovate helm PRs missing the enrichment
   marker so nothing is dropped.
5. **Split engine: deterministic core + scoped agent.** The mechanical parts
   (version delta, upstream values diff) are testable shell; the LLM is confined
   to prose synthesis from a fetched source-of-truth URL — honoring CLAUDE.md's
   "fetch a known-working example, don't synthesize from memory" rule.
6. **Short ADR.** This is a standing automation whose output the maintainer
   trusts when deciding to merge infra upgrades — judgment-bearing, not just
   plumbing. An ADR records the advise-not-decide posture and the source-registry
   grounding rule.

## Architecture

One new workflow plus one committed registry file. No new secrets — reuses
`CLAUDE_CODE_OAUTH_TOKEN` and the `anthropics/claude-code-action@v1` action
already wired in `claude.yml` / `claude-code-review.yml`.

```
Renovate opens renovate/* PR bumping infra/**/Chart.yaml
                        │
        ┌───────────────┴────────────────┐
   pull_request:opened/reopened    schedule: daily cron sweep
   (head_ref renovate/*,           (open renovate helm PRs
    infra/**/Chart.yaml changed)    missing enrichment marker)
        └───────────────┬────────────────┘
                        ▼
        Job: detect  (deterministic shell — scripts/helm-enrich/)
          • diff main:Chart.yaml vs PR-head per dependency → (name, old, new)
          • helm repo add; helm show values --version OLD / NEW → values diff
          • look up upstream release-notes URL in source registry
          • emit context bundle (JSON)
                        ▼
        Job: enrich  (claude-code-action, scoped allowlist)
          • WebFetch the registry URL(s) for releases between OLD..NEW
          • synthesize migration notes (breaking changes, required actions)
          • render block: version delta + migration notes + values diff
          • gh pr edit --body: replace content between idempotent markers
```

The enrich workflow is **advisory, never a required check** — a failure never
blocks the maintainer from merging the Renovate PR.

## Components

### 1. `.github/workflows/helm-bump-enrich.yml`
- Triggers:
  - `pull_request: [opened, reopened]`, filtered to `head_ref` starting
    `renovate/` and changed paths matching `infra/**/Chart.yaml`.
  - `schedule:` daily cron sweep.
  - `workflow_dispatch:` (manual, takes a PR number) for rollout + re-runs.
- Two jobs: `detect` (shell) → `enrich` (agent).
- Concurrency keyed on PR number, `cancel-in-progress: false`.
- Permissions: `pull-requests: write` (edit body), `contents: read`,
  `id-token: write`. No `contents: write` — the agent never pushes commits.

### 2. `detect` job — deterministic core (`scripts/helm-enrich/`)
The reproducible part, extracted into scripts so it runs identically in CI and
locally and is unit-testable:
- Compute bumped `(dependency, old, new)` tuples by comparing
  `git show <base>:<Chart.yaml>` against the PR head per dependency entry.
- For each bump: `helm repo add` the dependency's repo, then
  `helm show values <repo>/<chart> --version OLD` and `--version NEW`, and diff
  the two upstream default value trees.
- Look up the dependency in the source registry to attach a release-notes URL.
- Emit a JSON context bundle (dependency, old, new, values-diff, source URL,
  plus a "source missing" flag where applicable).

### 3. Source registry — `infra/tools-upgrade-sources.yaml`
Maps each subchart dependency to its release-notes location, grounding the LLM
in a source-of-truth URL instead of synthesized memory. Each entry: `name`,
`repo` (helm repo URL, mirrors Chart.yaml), `releaseNotes` (GitHub repo / docs
URL to fetch). Initial entries:

| dependency        | releaseNotes source                                            |
|-------------------|----------------------------------------------------------------|
| signoz, k8s-infra | `SigNoz/charts` releases + signoz.io upgrade docs              |
| cert-manager      | `cert-manager/cert-manager` releases (explicit upgrade guides) |
| ingress-nginx     | `kubernetes/ingress-nginx` releases                            |
| external-dns      | `kubernetes-sigs/external-dns` releases                        |
| cloudnative-pg    | `cloudnative-pg/charts` + `cloudnative-pg/cloudnative-pg`      |
| hcloud-csi        | `hetznercloud/csi-driver` releases                             |
| matomo            | bitnami chart CHANGELOG + matomo release notes                 |
| nats              | `nats-io/k8s` (helm) releases                                  |

Per CLAUDE.md "registries cannot lag the things they register": adding a
subchart dependency means adding its source entry in the same PR. v1 documents
this rule; gating it in `registry-coherence.yml` is a possible later addition.

### 4. `enrich` job — scoped agent
`anthropics/claude-code-action@v1` with a confined allowlist: `WebFetch`,
`Bash(gh pr view/edit/comment)`. It receives the context bundle, fetches the
real release notes between OLD..NEW from the registry URL, synthesizes migration
notes (breaking changes + required operator actions), renders one Markdown
block, and edits the PR body between idempotent markers:

```
<!-- helm-enrich:start -->
...rendered block...
<!-- helm-enrich:end -->
```

Re-runs replace the block, never stack it. Marker presence is what the cron
sweep checks to decide "already enriched."

## Data flow

`Chart.yaml` version delta + upstream `values.yaml` delta (both deterministic)
→ bundled with registry release-notes URLs → agent fetches release notes →
renders one Markdown block → spliced into the existing Renovate PR body between
markers.

## Error handling

- **No registry entry for a bumped dependency** → post a values-diff-only block
  and explicitly flag the missing source. Never fabricate a URL.
- **`helm show values` fails** (repo down, version yanked) → skip the values
  diff, still attempt migration notes, annotate which part failed. Partial
  enrichment beats none.
- **WebFetch fails / release notes 404** → emit version delta + values diff with
  a "release notes unavailable, review manually" note.
- **Non-helm or non-infra Renovate PR slips past the path filter** → detect job
  finds zero bumped infra deps → exit cleanly, no comment.
- **Idempotency** → always replace between markers; re-runs (synchronize, cron,
  manual dispatch) never append a second block.
- **Non-blocking** → the workflow is not a required check; a failed enrichment
  never blocks merge. It is advisory.

## Testing

- **`scripts/helm-enrich/` deterministic core** gets real unit tests, no mocking
  of `helm`:
  - version-delta parsing from a `Chart.yaml` diff (fixtures),
  - values-diff rendering from two captured `values.yaml` files,
  - registry lookup including the missing-entry path.
- **The LLM enrich step** is not unit-tested (non-deterministic). Validated via
  `workflow_dispatch` against a real open Renovate PR during rollout, and by
  eyeballing the first live enrichments.
- **Workflow YAML** reviewed manually / via `actionlint` if available
  (`helm-lint` covers charts, not workflows).

## ADR

A short ADR records:
- the **advise-not-decide** posture (the agent enriches; the human merges;
  deploy stays manual),
- the **PR-only / no-prod-access** boundary,
- the **source-registry grounding** rule (fetch a source-of-truth URL, never
  synthesize release notes from LLM memory),
- the **registry-coherence** obligation (new subchart ⇒ new source entry, same
  PR).

Add the ADR to `docs/adr/INDEX.md` in the same PR (per CLAUDE.md).

## Open questions for the plan

- Exact `base` ref the detect job diffs against (`origin/main` vs PR base SHA)
  for robustly identifying the bumped versions across Renovate's grouped PRs
  (a grouped PR may bump several deps at once — the detect job must handle N
  bumps per PR, not just one).
- Whether the values diff should be raw (`diff` of two YAMLs) or key-path-aware
  (added/removed/changed default keys) — the latter reads better but needs a
  small YAML-aware differ.
- Whether to also surface, alongside the upstream-default diff, a note when a
  changed default key is one the repo overrides in `values-prod.yaml`
  (highest-signal for the operator, but couples detect to the override files).
