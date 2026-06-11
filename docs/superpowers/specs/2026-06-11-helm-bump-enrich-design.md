# Helm bump enrichment — design

**Date:** 2026-06-11
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/helm-bump-enrich`

## Problem

The in-cluster internal tools are versioned two different ways, and a bare bump
PR for either forces the maintainer to do the upgrade homework by hand: read the
upstream release notes, find the breaking changes, and work out what config must
change.

- **Subchart tools** (SigNoz + `k8s-infra`, the five platform operators) are
  pinned as Helm subchart `dependencies:` in `infra/**/Chart.yaml`. Renovate
  already opens mechanical bump PRs for these on its Monday "helm subcharts"
  schedule.
- **Image-pinned tools** (matomo + its MariaDB, nats + its sidecars) are
  first-party template charts with `dependencies: []`; their version lives in a
  container-image `tag:` in the chart's own `values.yaml`. Renovate has **no
  configured manager** that touches those tags today — so these tools currently
  get **no update PR at all**.

We want each bump PR — for either kind — to arrive **enriched** with that
homework already done (version delta, migration notes synthesized from official
release docs, and — for subcharts — the upstream default `values.yaml` diff
against the repo's overrides), so the maintainer reviews and merges with full
context. Deploy stays manual (the operator runs `helm upgrade` after merge,
exactly as today).

## Scope

This design covers **all** in-cluster internal tools, via **two enrichment
modes** sharing one workflow, registry, and agent. It ships as **two PRs** (see
Rollout):

**Mode A — subchart bumps (7 deps, PR 1):** the Helm subchart `dependencies:`
Renovate's `helmv3` manager already bumps:
- `infra/observability`: `signoz`, `k8s-infra`.
- `infra/platform`: `cert-manager`, `ingress-nginx`, `external-dns`,
  `cloudnative-pg`, `hcloud-csi`.

Enrichment = version delta + migration notes + **key-path-aware upstream default
`values.yaml` diff** (overridden keys flagged).

**Mode B — image-tag bumps (matomo, nats, PR 2):** the container images pinned
in `infra/matomo/values.yaml` and `infra/nats/values.yaml`. Requires **adding
Renovate image-tag coverage** (a `customManagers`/regex manager over those
`tag:` fields) so a bump PR exists at all — independently valuable, since these
tools get no update PR today. Images in scope:
- matomo: `matomo`, `mariadb`
- nats: `nats` (server), `natsio/nats-box`, `natsio/prometheus-nats-exporter`
  (the last two are low-risk sidecars).

Enrichment = image-version delta + migration notes from the **app's** release
docs. There is **no upstream-chart `values.yaml` diff** in Mode B — the chart is
our own templates, so nothing upstream changes; the migration notes carry the
whole signal (e.g. Matomo major DB migrations, NATS JetStream upgrade notes).

**Out of scope (both modes):**
- Deploy automation. `helm upgrade` for these charts remains a manual operator
  step (`docs/deploy.md`). A deploy-on-merge workflow is a possible later
  project; this design does not build it.
- Owning the mechanical bump. Renovate keeps editing `Chart.yaml` / `Chart.lock`
  and computing the lockfile digest. The agent only adds the intelligence layer.
- Auto-merge. A human reviews and merges every enriched PR.

## Decisions (from brainstorm)

1. **PR-only.** No prod access, no deploy. Lowest blast radius.
2. **Augment Renovate, don't replace it.** Renovate is battle-tested at the
   mechanical bump + lockfile digest. The agent enriches its open PRs; no
   duplicate PRs.
3. **One PR per tool.** Un-group Renovate's "helm subcharts" group so each
   subchart dependency gets its own bump PR. A grouped PR that bumps several
   tools at once is too complicated for the operator to review, for the values
   differ to render coherently, and for the override cross-reference to attribute
   per tool. One bump per PR keeps the detect job, the diff, and the operator's
   decision each scoped to a single tool. (`signoz` and `k8s-infra` version
   independently, so they remain separate PRs — that is the desired behavior.)
4. **Two modes, one engine, two PRs.** Mode A (subcharts) and Mode B (image
   tags) share the workflow, registry, and agent; the detect job branches on
   which kind of bump the PR carries. Mode A ships first (PR 1), Mode B second
   (PR 2) — same end state, respects the 400-line cap. Mode B additionally adds
   Renovate image-tag coverage so a bump PR exists.
5. **Event-driven + cron safety net.** Enrich on `pull_request: opened` within
   minutes; a daily cron sweeps open renovate PRs missing the enrichment marker
   so nothing is dropped.
6. **Split engine: deterministic core + scoped agent.** The mechanical parts
   (version delta, upstream values diff, override cross-reference) are testable
   shell; the LLM is confined to prose synthesis from a fetched source-of-truth
   URL — honoring CLAUDE.md's "fetch a known-working example, don't synthesize
   from memory" rule.
7. **Key-path-aware values diff (Mode A only).** The differ reports added /
   removed / changed default keys between the old and new upstream `values.yaml`
   (not a raw text diff), so the operator sees a structured list of what moved.
   Mode B has no upstream values to diff.
8. **Override cross-reference (Mode A only).** For each changed/removed upstream
   default key, flag whether the repo pins that key in the chart's
   `values-prod.yaml` (and `values.yaml` / `values-local.yaml` where present). An
   upstream default change on a key the repo overrides is the highest-signal
   item — it may be a no-op (repo already pins it) or a required reconciliation.
   This couples the detect job to the override files by design.
9. **Short ADR.** This is a standing automation whose output the maintainer
   trusts when deciding to merge infra upgrades — judgment-bearing, not just
   plumbing. An ADR records the advise-not-decide posture, the two-mode model,
   and the source-registry grounding rule.

## Architecture

One new workflow plus one committed registry file. No new secrets — reuses
`CLAUDE_CODE_OAUTH_TOKEN` and the `anthropics/claude-code-action@v1` action
already wired in `claude.yml` / `claude-code-review.yml`.

```
Renovate opens renovate/* PR bumping
  Mode A: infra/**/Chart.yaml dependency version
  Mode B: infra/{matomo,nats}/values.yaml image tag
                        │
        ┌───────────────┴────────────────┐
   pull_request:opened/reopened    schedule: daily cron sweep
   (head_ref renovate/*, changed     (open renovate PRs under
    paths infra/**/Chart.yaml OR      infra/** missing the
    infra/**/values*.yaml)            enrichment marker)
        └───────────────┬────────────────┘
                        ▼
        Job: detect  (deterministic shell — scripts/helm-enrich/)
          • classify PR: Mode A (Chart.yaml dep) or Mode B (image tag)
          • parse the single (name, old, new) from PR-base vs PR-head
          • Mode A only: helm show values --version OLD/NEW
              → key-path-aware diff (added/removed/changed keys)
              → cross-ref changed keys against values-prod.yaml overrides
          • look up release-notes URL in source registry (by chart or image)
          • emit context bundle (JSON, with `mode`)
                        ▼
        Job: enrich  (claude-code-action, scoped allowlist)
          • WebFetch the registry URL for releases between OLD..NEW
          • synthesize migration notes (breaking changes, required actions)
          • render block: version delta + migration notes
              + (Mode A) keyed values diff with overridden keys flagged
          • gh pr edit --body between idempotent markers
```

The enrich workflow is **advisory, never a required check** — a failure never
blocks the maintainer from merging the Renovate PR.

## Components

### 1. `.github/workflows/helm-bump-enrich.yml`
- Triggers:
  - `pull_request: [opened, reopened]`, filtered to `head_ref` starting
    `renovate/` and changed paths matching `infra/**/Chart.yaml` (Mode A) or
    `infra/**/values*.yaml` (Mode B).
  - `schedule:` daily cron sweep over open `renovate/` PRs under `infra/**`.
  - `workflow_dispatch:` (manual, takes a PR number) for rollout + re-runs.
- Two jobs: `detect` (shell) → `enrich` (agent).
- Concurrency keyed on PR number, `cancel-in-progress: false`.
- Permissions: `pull-requests: write` (edit body), `contents: read`,
  `id-token: write`. No `contents: write` — the agent never pushes commits.

### 2. `detect` job — deterministic core (`scripts/helm-enrich/`)
The reproducible part, extracted into scripts so it runs identically in CI and
locally and is unit-testable. One PR per tool → exactly one bumped unit:
- **Classify the PR** as Mode A (a `dependencies:` version changed in a
  `Chart.yaml`) or Mode B (an image `tag:` changed in a `values.yaml`) by
  diffing `git show <pr-base-sha>:<file>` against the PR head.
- Parse the single `(name, old, new)`. If a PR somehow carries more than one
  bumped unit (grouping misconfig), process each and render one block apiece;
  the expected case is one.
- **Mode A only** — `helm repo add` the dependency's repo, then
  `helm show values <repo>/<chart> --version OLD` and `--version NEW`:
  - **Key-path-aware diff**: walk both default value trees and emit added /
    removed / changed leaf keys (dotted path + old/new value), not raw text.
  - **Override cross-reference**: for each changed/removed default key, check
    whether the chart's `values-prod.yaml` (+ `values.yaml` / `values-local.yaml`
    where present) sets it; mark `overridden: true|false`.
- Look up the unit (chart name or image repository) in the source registry to
  attach a release-notes URL.
- Emit a JSON context bundle: `mode`, name, old, new, source URL, "source
  missing" flag, and — Mode A — the keyed values diff with override flags.

### 3. Source registry — `infra/tools-upgrade-sources.yaml`
Maps each unit (subchart dependency **or** container image) to its release-notes
location, grounding the LLM in a source-of-truth URL instead of synthesized
memory. Each project tags releases under its own convention, so the registry
stores a **URL pattern** with a `{version}` placeholder — the agent fetches the
exact release page, not a generic listing. Two sub-sections keyed by `mode`.

**Mode A — subchart deps.** Each entry: `name`, `repo` (helm repo URL, mirrors
Chart.yaml), `releaseNotes` (templated URL), optional `extraDocs`. Verified
2026-06-11:

| dependency      | releaseNotes (`{version}` = new chart version) | extraDocs |
|-----------------|------------------------------------------------|-----------|
| `signoz`        | `github.com/SigNoz/charts/releases/tag/v{version}` | signoz.io upgrade docs |
| `k8s-infra`     | `github.com/SigNoz/charts/releases` (same repo, independent tag line) | — |
| `cert-manager`  | `github.com/cert-manager/cert-manager/releases/tag/v{version}` (chart+app versions coupled) | `cert-manager.io/docs/releases/release-notes/` + `/docs/installation/upgrade/` |
| `ingress-nginx` | `github.com/kubernetes/ingress-nginx/releases/tag/helm-chart-{version}` | `Changelog.md` |
| `external-dns`  | `github.com/kubernetes-sigs/external-dns/releases/tag/external-dns-helm-chart-{version}` | chart `CHANGELOG` on the docs site |
| `cloudnative-pg`| `github.com/cloudnative-pg/charts/releases` (chart) | `github.com/cloudnative-pg/cloudnative-pg/releases` (operator app) |
| `hcloud-csi`    | `github.com/hetznercloud/csi-driver` `CHANGELOG.md` / releases (chart lives under `/chart`) | — |

Notes from verification:
- `signoz` and `k8s-infra` share the `SigNoz/charts` repo but version on
  independent tag lines — keep them as two registry entries (matches the
  one-PR-per-tool model).
- `ingress-nginx` and `external-dns` tag chart releases distinctly from the app
  (`helm-chart-*` / `external-dns-helm-chart-*`) — the templated pattern is what
  makes the fetch land on the chart release, not the app release.
- `cloudnative-pg` does not expose a stable per-version chart-release tag URL in
  the same way; fetch the releases listing and let the agent locate the matching
  chart entry, cross-checking the operator-app release notes.

**Mode B — container images.** Keyed by image `repository`. Each entry: `image`,
`releaseNotes` (templated URL), optional `extraDocs`, `priority`. Verified
2026-06-11:

| image                              | releaseNotes (`{version}` = new image version) | priority |
|------------------------------------|------------------------------------------------|----------|
| `matomo`                           | `matomo.org/changelog/` (curated, per-version) + `github.com/matomo-org/matomo/releases` | high (major = DB migrations) |
| `mariadb`                          | `mariadb.com/docs/release-notes/community-server/{series}/{version}` | high (major upgrades) |
| `nats`                             | `github.com/nats-io/nats-server/releases/tag/v{version}` + `docs.nats.io` upgrade guides | high (JetStream) |
| `natsio/nats-box`                  | `github.com/nats-io/nats-box/releases` | low (debug sidecar) |
| `natsio/prometheus-nats-exporter`  | `github.com/nats-io/prometheus-nats-exporter/releases` | low (metrics sidecar) |

Notes from verification:
- Image tags carry flavour suffixes (`matomo:5.2.1-apache`, `mariadb:11.4.4-noble`,
  `nats:2.10-alpine`). The Renovate image-tag manager (component 5) needs
  `extractVersion` / a versioning strategy to bump the numeric part while
  preserving the suffix; the detect parser strips the suffix to derive
  `{version}` for the registry URL.
- `nats` is pinned to a floating minor line (`2.10`), so Mode B fetches the
  target minor's upgrade guide, not a single patch release.

Per CLAUDE.md "registries cannot lag the things they register": adding a subchart
dependency or a pinned image means adding its source entry in the same PR. v1
documents this rule; gating it in `registry-coherence.yml` is a possible later
addition.

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

### 5. Renovate config edit — `renovate.json`
- **Mode A (PR 1):** remove the `groupName: "helm subcharts"` rule so each
  subchart dependency gets its own bump PR (one PR per tool). Keep the Monday
  `schedule` for the helm manager.
- **Mode B (PR 2):** add a `customManagers` (regex) entry matching the image
  `repository:`/`tag:` pairs in `infra/matomo/values.yaml` and
  `infra/nats/values.yaml`, with `extractVersion` to handle the flavour suffixes
  (`-apache`, `-noble`, `-alpine`). One PR per image. This is what creates the
  bump PRs Mode B enriches — without it these tools get no update PR at all.

## Data flow

Version delta (Mode A: Chart.yaml dep; Mode B: image tag) + — Mode A only —
key-path-aware upstream `values.yaml` diff with override flags (all
deterministic) → bundled with the registry release-notes URL → agent fetches
release notes → renders one Markdown block → spliced into the existing Renovate
PR body between markers. One bumped unit per PR.

## Error handling

- **No registry entry for a bumped unit** → Mode A posts a values-diff-only
  block; Mode B posts a version-delta-only block. Both explicitly flag the
  missing source. Never fabricate a URL.
- **`helm show values` fails** (Mode A; repo down, version yanked) → skip the
  values diff, still attempt migration notes, annotate which part failed. Partial
  enrichment beats none.
- **Mode B has no values diff** by design — the block carries version delta +
  app migration notes only; this is expected, not an error.
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
  - **PR classification** — Mode A (Chart.yaml dep) vs Mode B (values.yaml image
    tag) from fixture diffs,
  - version-delta parsing for both a `Chart.yaml` dep and a suffixed image tag
    (`5.2.1-apache` → `5.2.1`),
  - key-path-aware diff from two captured `values.yaml` files (added / removed /
    changed leaf keys) — Mode A,
  - override cross-reference against a fixture `values-prod.yaml` (overridden vs
    not-overridden key) — Mode A,
  - registry lookup for both a chart name and an image repository, including the
    missing-entry path.
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
- the **two-mode model** (subchart values-diff enrichment vs image-tag app-notes
  enrichment) and why image-pinned tools need their own Renovate manager,
- the **source-registry grounding** rule (fetch a source-of-truth URL, never
  synthesize release notes from LLM memory),
- the **registry-coherence** obligation (new subchart or pinned image ⇒ new
  source entry, same PR).

Add the ADR to `docs/adr/INDEX.md` in the same PR (per CLAUDE.md).

## Rollout — two PRs

Both modes share the workflow, registry, and `scripts/helm-enrich/` core, so the
split keeps each PR under the 400-line cap rather than separating concerns
artificially.

- **PR 1 — Mode A (subcharts).** Workflow + detect core (classification + Mode-A
  values diff/override) + registry Mode-A section + Renovate "helm subcharts"
  un-grouping + ADR. End state: the 7 subchart deps enrich on bump.
- **PR 2 — Mode B (images).** Renovate image-tag `customManagers` + detect Mode-B
  branch (no values diff) + registry Mode-B section + tests for classification
  and suffix parsing. End state: matomo/nats images get bump PRs *and* enrich.

## Open questions for the plan

None blocking. All release sources verified on the web 2026-06-11 (see registry
tables). Confirm during implementation: the exact `customManagers` regex +
`extractVersion` for the suffixed image tags, and whether the two low-priority
nats sidecars (`nats-box`, `prometheus-nats-exporter`) are worth enriching or
just bumped silently.
