# Design: Auto-generated, drift-gated infra diagrams in the README

**Date:** 2026-06-11
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

The README is thorough prose but has no diagrams. The maintainer wants
the README to carry "nice charts of the infra" that stay **up-to-date on
the go** as the project changes. Diagrams rot faster than prose, so the
*freshness mechanism* is the core of this design, not the diagrams
themselves.

## Goal

Four Mermaid diagrams embedded in the README, generated from the repo's
real sources of truth, with CI gates that make it impossible for the
diagrams to silently lag the infrastructure they describe — mirroring the
existing `openapi-typescript-drift` and `registry-coherence` patterns.

## Decisions (locked during brainstorming)

1. **Freshness mechanism:** generated-from-source with a CI drift gate
   (not hand-drawn + reminder, not agent-convention-only).
2. **Diagrams:** all four — cluster app topology, cloud & deploy
   topology, request/event flow, clue AI pipeline.
3. **Fact sourcing:** hybrid — parse charts/terraform for *nodes*, a
   versioned descriptor declares *semantic edges*; descriptor is
   coherence-gated against the real charts.
4. **Cloud nodes:** declared in the descriptor **plus** a lightweight
   `grep` of `terraform/*.tf` for known resource-type strings, which
   fails if a TF resource exists but isn't declared. No HCL parser.
5. **README integration:** diagrams embed into existing relevant
   sections via marker comments (not one new "Architecture diagrams"
   section).

## Architecture

A single Python generator under `scripts/infra_diagrams/` renders Mermaid
blocks into `README.md` between marker comments. It draws facts from two
tiers:

### Tier 1 — derived (parsed, can never lag)

- **Helm charts** under `infra/` and `<ctx>/api/deploy/{chart,db-chart}/`
  → app nodes and Postgres nodes. Chart names come from `Chart.yaml`
  `name:`. A Postgres node is detected by a template manifest with
  `apiVersion: postgresql.cnpg.io` (NOT bare `kind: Cluster`, which also
  matches cert-manager's `ClusterIssuer`).
- **Deploy workflows** `.github/workflows/deploy-*.yml` → deploy edges
  (what ships where: `deploy-frontend.yml` → Cloudflare Pages,
  `deploy-api-k8s.yml` → `helm upgrade`).

### Tier 2 — declared (`docs/infra/topology.yaml`)

Declares facts no chart contains:

- NATS JetStream event publishers/consumers (which context emits/consumes
  which event).
- Browser → API edges and their transport (REST vs WebSocket/WSS).
- Telemetry edges (apps → SigNoz).
- Cloud nodes (Cloudflare Pages, DNS, Hetzner k3s node(s)).
- Clue AI pipeline stage list.

### Coherence gate (descriptor cannot drift from reality)

The generator cross-checks the descriptor against derived facts:

- Every parsed chart (app) must appear in `topology.yaml`, and every app
  the descriptor names must have a real chart. Missing/extra → fail.
- Every Terraform resource of a known type
  (`cloudflare_pages_project`, `cloudflare_record`, the k8s module
  reference) found by `grep` in `terraform/*.tf` must have a
  corresponding declared cloud node. Missing → fail.

This means a new bounded context (new chart) cannot be added without the
descriptor — and therefore the diagrams — being updated in the same PR.

## The four diagrams (all Mermaid, native GitHub render)

| Diagram | Nodes from | Edges from | README section |
|---|---|---|---|
| **Cluster app topology** | charts (grid/game/identity/survey APIs + CNPG Postgres each, `bliss-nats`, SigNoz, Matomo, ingress-nginx, cert-manager) | descriptor (events, telemetry) | "Infrastructure (IaC)" |
| **Cloud & deploy topology** | descriptor cloud nodes (+ TF grep gate) | deploy workflows | "Infrastructure (IaC)" |
| **Request / event flow** | charts (apps), descriptor | descriptor (REST/WSS, NATS events, telemetry) | "Infrastructure (IaC)" |
| **Clue AI pipeline** | descriptor stage list | descriptor | "Local AI pipeline (clue generation)" |

Confirmed chart inventory at design time:
- `infra/platform` (ingress-nginx, cert-manager, ClusterIssuers)
- `infra/observability` (SigNoz) + `alerts` subchart
- `infra/nats` (name `bliss-nats`, JetStream)
- `infra/matomo` (name `matomo`, MariaDB)
- `grid/api/deploy/chart` (name `wordsparrow-api`; Postgres inline via
  `postgres-cluster.yaml`)
- `game/api/deploy/chart` (name `bliss-game-api`) + `db-chart`
- `identity/api/deploy/chart` (name `bliss-identity-api`) + `db-chart`
- `survey/api/deploy/chart` (name `bliss-survey-api`) + `db-chart`

All four contexts have a CNPG Postgres (`apiVersion: postgresql.cnpg.io`).

## README integration — marker injection

Each diagram is wrapped in HTML comment markers; the generator replaces
**only** the content between markers, never touching surrounding prose:

````
<!-- INFRA-DIAGRAM:cluster START -->
```mermaid
...generated...
```
<!-- INFRA-DIAGRAM:cluster END -->
````

Marker IDs: `cluster`, `cloud`, `flow`, `clue-pipeline`. The generator
errors if a declared marker pair is missing or malformed.

## Freshness — three layered guarantees

A new CI gate `.github/workflows/readme-diagrams-drift.yml` (mirrors
`openapi-typescript-drift.yml`) runs the generator and
`git diff --exit-code`:

- New chart added, not in descriptor → **coherence check fails** (forces
  descriptor update in the same PR).
- New TF cloud resource, not in descriptor → **TF-grep coherence fails**.
- Descriptor changed, README not regenerated → **drift check fails**.
- README diagram hand-edited → **drift check fails** (regen overwrites).

Local workflow: `make diagrams` regenerates in place; the generator is
idempotent (running twice produces no diff).

## Culture integration

- Document `scripts/infra_diagrams/` and `docs/infra/topology.yaml` in
  `CLAUDE.md` under the "Registries cannot lag the things they register"
  rule, naming the descriptor as a registry.
- One-line note in the `dispatch` skill so agents touching `infra/` or
  adding a bounded context know to update `topology.yaml`.

## Testing

`scripts/infra_diagrams/test_generate.py`:

- Chart parsing: app nodes discovered; Postgres detection matches
  `apiVersion: postgresql.cnpg.io` and **excludes** cert-manager
  `ClusterIssuer`.
- Coherence check fails on a chart missing from the descriptor, and on a
  descriptor app with no chart.
- TF-grep coherence fails when a known resource type is present in
  `terraform/*.tf` but absent from declared cloud nodes.
- Marker injection replaces only between markers; surrounding prose is
  byte-identical.
- Idempotency: generate twice → no diff.

## Scope & cost

~3 source files (`generate.py`, descriptor loader/coherence, test) +
`docs/infra/topology.yaml` + 1 workflow + README marker edits + a
`make diagrams` target + CLAUDE.md / dispatch-skill notes. Well under the
400-line cap.

## Mermaid conventions (resolved)

- **Syntax:** `flowchart` (the current canonical form, not the older
  `graph` alias).
- **Orientation:** `flowchart LR` (left-to-right) for **all four**
  diagrams — three are naturally horizontal flows (deploy pipeline,
  request flow, clue pipeline), so the cluster diagram matches for a
  single consistent reading direction.
- **Grouping:** the dense cluster-topology diagram groups nodes into
  `subgraph`s — `Edge` (ingress-nginx, cert-manager), `APIs`
  (grid/game/identity/survey), `Data` (CNPG Postgres per context),
  `Messaging` (`bliss-nats`), `Observability` (SigNoz), plus Matomo —
  so 12+ nodes don't sprawl.
- Postgres nodes use the cylinder shape `[(name)]`; apps use plain
  rectangles.

## Dependency (resolved)

PyYAML **6.0.3 is already vendored** in the repo's `.venv` and used by
`modal_jobs/style_allocation.py` (`yaml.safe_load`) — **no new
dependency**. The generator pins it in
`scripts/infra_diagrams/requirements.txt` (mirrors the existing
`scripts/clue_generation/pipeline_v2/requirements.txt` convention). The
drift workflow installs it via `actions/setup-python` (SHA-pinned) +
`pip install -r scripts/infra_diagrams/requirements.txt`, since no CI job
currently runs Python.

## Non-goals / explicit exclusions

- **No HCL parser** — cloud nodes are descriptor-declared with a grep
  gate, not parsed from HCL.
- **No new ADR** — this adds tooling, not a bounded context, dependency
  contract, or deploy-target change. (PyYAML already present — see
  Dependency above.)
- **No rendered image build** — Mermaid renders natively on GitHub; no
  SVG/PNG generation step, keeping diagrams diffable.
- **No new "Architecture diagrams" section** — diagrams embed into
  existing sections.
