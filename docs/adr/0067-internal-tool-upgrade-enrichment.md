# ADR-0067: Internal-tool upgrade-PR enrichment

## Status
Accepted

## Context
In-cluster internal tools (SigNoz + k8s-infra, the platform operators;
matomo and nats via image tags) need to stay current. Renovate opens bare
version-bump PRs for the Helm subcharts but nothing synthesizes the upgrade
homework — release-note breaking changes, required config actions, and how
the upstream default values moved relative to our `values-prod.yaml`
overrides. Image-pinned tools (matomo, nats) had no update PR at all.

## Decision
Add an advisory enrichment workflow that augments each Renovate bump PR with
a generated context block (version delta, migration notes fetched from the
official release docs, and — for subcharts — a key-path values diff with
overridden keys flagged). Two modes share one workflow, registry, and
deterministic Python core: Mode A (subchart deps, with values diff) and
Mode B (image tags in values.yaml, app release notes, no values diff). Mode B
adds Renovate `customManagers` so those tools get bump PRs at all.

Posture:
- **Advise, do not decide.** The agent enriches; a human merges; deploy stays
  a manual `helm upgrade` (no prod access in this workflow).
- **Ground every note in a source-of-truth URL** from
  `infra/tools-upgrade-sources.yaml`; never synthesize release notes from
  model memory (see the 2026-05-21 SigNoz-alerts incident).
- **Registry coherence.** Adding a subchart dependency or a pinned image
  requires adding its source entry in the same PR.

## Consequences
Easier: upgrades arrive review-ready; image-pinned tools finally get PRs.
Harder/different: the source registry must be maintained alongside new tools;
the workflow consumes tokens per bump PR. The enrichment is non-blocking — a
failure never blocks a merge.

Mode B (image-tag enrichment for matomo + nats) went live in the follow-up PR;
those tools now receive Renovate bump PRs (previously none) and enrichment.
