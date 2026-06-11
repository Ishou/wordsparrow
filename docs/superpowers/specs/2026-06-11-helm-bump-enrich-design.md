# Helm bump enrichment — design

**Date:** 2026-06-11
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/helm-bump-enrich`

## Problem

Several in-cluster internal tools (SigNoz + `k8s-infra`, the five platform
operators) are pinned as Helm subchart dependencies in `infra/**/Chart.yaml`.
(matomo and nats are first-party template charts with no subchart deps — out of
scope; see Scope.) Renovate already opens mechanical bump PRs for the subcharts
on its Monday "helm subcharts" schedule, but a bare bump PR forces the maintainer
to do the upgrade
homework by hand: read the upstream release notes, find the breaking changes,
and diff the chart's default `values.yaml` to see what config the override files
(`values-prod.yaml`) must reconcile.

We want each helm-bump PR to arrive **enriched** with that homework already
done, so the maintainer reviews and merges with full context. Deploy stays
manual (the operator runs `helm upgrade` after merge, exactly as today).

## Scope

**In scope (v1):** the **7 Helm subchart dependencies** Renovate's `helmv3`
manager actually bumps — i.e. real `dependencies:` entries in an
`infra/**/Chart.yaml`:
- `infra/observability`: `signoz`, `k8s-infra`.
- `infra/platform`: `cert-manager`, `ingress-nginx`, `external-dns`,
  `cloudnative-pg`, `hcloud-csi`.

For each `renovate/` PR bumping one of these, append to the PR body: the version
delta, synthesized migration notes from official release docs, and the
key-path-aware upstream default `values.yaml` diff (overridden keys flagged).

**Out of scope (v1):**
- **matomo and nats** — both are first-party template charts with
  `dependencies: []` (matomo deliberately avoids Bitnami per ADR-0025; nats
  enables JetStream via its own config). Renovate's `helmv3` manager has nothing
  to bump in them, so no subchart PR is ever opened. Their *app* versions move
  via container-image tags (`appVersion` / image pins in values), which is a
  different manager and a possible later project — not this one.
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
4. **All 7 real subchart deps** in scope from day one (observability + platform;
   not matomo/nats, which have none). Enrichment quality varies by how good each
   upstream's release docs are; the design degrades gracefully when docs are
   missing (see Error handling).
4. **Event-driven + cron safety net.** Enrich on `pull_request: opened` within
   minutes; a daily cron sweeps open renovate helm PRs missing the enrichment
   marker so nothing is dropped.
5. **Split engine: deterministic core + scoped agent.** The mechanical parts
   (version delta, upstream values diff, override cross-reference) are testable
   shell; the LLM is confined to prose synthesis from a fetched source-of-truth
   URL — honoring CLAUDE.md's "fetch a known-working example, don't synthesize
   from memory" rule.
6. **Key-path-aware values diff.** The differ reports added / removed / changed
   default keys between the old and new upstream `values.yaml` (not a raw text
   diff), so the operator sees a structured list of what moved.
7. **Override cross-reference.** For each changed/removed upstream default key,
   flag whether the repo pins that key in the chart's `values-prod.yaml` (and
   `values.yaml` / `values-local.yaml` where present). An upstream default change
   on a key the repo overrides is the highest-signal item — it may be a no-op
   (repo already pins it) or a required reconciliation. This couples the detect
   job to the override files by design.
8. **Short ADR.** This is a standing automation whose output the maintainer
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
          • diff PR-base Chart.yaml vs PR-head → the single (name, old, new)
          • helm repo add; helm show values --version OLD / NEW
          • key-path-aware diff → added/removed/changed default keys
          • cross-ref changed keys against the chart's values-prod.yaml overrides
          • look up upstream release-notes URL in source registry
          • emit context bundle (JSON)
                        ▼
        Job: enrich  (claude-code-action, scoped allowlist)
          • WebFetch the registry URL for releases between OLD..NEW
          • synthesize migration notes (breaking changes, required actions)
          • render block: version delta + migration notes + keyed values diff
            (overridden keys flagged) → gh pr edit --body between markers
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
locally and is unit-testable. With one PR per tool the job handles exactly one
bumped dependency:
- Identify the single bumped `(dependency, old, new)` by comparing
  `git show <pr-base-sha>:<Chart.yaml>` against the PR head. If the PR somehow
  carries more than one bumped dependency (grouping misconfig), process each and
  render one block per dependency, but the expected case is one.
- `helm repo add` the dependency's repo, then
  `helm show values <repo>/<chart> --version OLD` and `--version NEW`.
- **Key-path-aware diff**: walk both default value trees and emit added /
  removed / changed leaf keys (dotted path + old/new value), not a raw text diff.
- **Override cross-reference**: for each changed/removed default key, check
  whether the chart's `values-prod.yaml` (and `values.yaml` / `values-local.yaml`
  where present) sets that key; mark it `overridden: true|false` so the operator
  immediately sees whether the upstream change is a no-op or a reconciliation.
- Look up the dependency in the source registry to attach a release-notes URL.
- Emit a JSON context bundle (dependency, old, new, keyed values diff with
  override flags, source URL, plus a "source missing" flag where applicable).

### 3. Source registry — `infra/tools-upgrade-sources.yaml`
Maps each subchart dependency to its release-notes location, grounding the LLM
in a source-of-truth URL instead of synthesized memory. Each project tags chart
releases under its own convention, so the registry stores a **URL pattern** with
a `{version}` placeholder (the new chart version) — the agent fetches the exact
release page, not a generic listing. Each entry: `name`, `repo` (helm repo URL,
mirrors Chart.yaml), `releaseNotes` (templated URL), and optional `extraDocs`
(curated upgrade guide). Verified 2026-06-11:

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

### 5. Renovate config edit — `renovate.json`
Remove the `groupName: "helm subcharts"` rule so each subchart dependency gets
its own bump PR (one PR per tool). Keep the Monday `schedule` for the helm
manager. This is what makes the detect job, the values diff, and the operator's
review each scoped to a single tool.

## Data flow

`Chart.yaml` version delta + key-path-aware upstream `values.yaml` diff with
override flags (all deterministic) → bundled with the registry release-notes URL
→ agent fetches release notes → renders one Markdown block → spliced into the
existing Renovate PR body between markers. One bumped dependency per PR.

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
  - key-path-aware diff from two captured `values.yaml` files (added / removed /
    changed leaf keys),
  - override cross-reference against a fixture `values-prod.yaml` (overridden vs
    not-overridden key),
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

## Resolved design choices

- **One PR per tool** (Decision 3). The detect job diffs against the PR base SHA
  and expects a single bumped dependency. Renovate's "helm subcharts" group is
  removed.
- **Key-path-aware values diff** (Decision 6), not raw text — needs a small
  YAML-aware leaf differ in `scripts/helm-enrich/`.
- **Override cross-reference** (Decision 7): the diff flags each changed/removed
  upstream default key as overridden-by-repo or not, by reading the chart's
  `values-prod.yaml` (and sibling values files where present).

## Open questions for the plan

None blocking. Release sources verified on the web 2026-06-11 (see registry
table). matomo/nats confirmed out of scope (no subchart dependencies).
