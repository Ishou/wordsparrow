# ADR-0101: Cluster HA/DR hardening

## Status

Proposed — tracking record. Individual remediation items are checked off
here as their own PRs land; the ADR stays open until the roadmap is
complete, then moves to Accepted.

## Context

On 2026-07-11, unwedging a stuck `wordsparrow-game-api-pg` failover surfaced
that WAL archiving had never worked for four of five production Postgres
clusters and none but `grid` had ever taken a base backup (fixed same day —
see below). That backup gap was one instance of a broader pattern, so we ran
a read-only audit of the prod cluster (`~/.kube/wordsparrow-prod`) looking
for the same *class* of flaw: HA/DR that is **declared in manifests but never
validated against an actual node or process failure**.

The audit was point-in-time (`kubectl get/describe`, `df` inside DB pods, no
mutations). Findings below cite the observed state. Dimensions that came back
clean: TLS certificates (all Ready, auto-renewing via cert-manager, nearest
expiry 2026-08-23), CronJobs (all active, on schedule), DB disk fill (3–7% of
10–20Gi volumes), and — after 2026-07-11 — backups.

### Findings

**F1 — Single failure domain for every database (critical).**
The cluster has three nodes: `wordsparrow-cp-0` (control-plane, **untainted**),
`wordsparrow-obs-0` (tainted `dedicated=observability:NoSchedule`), and
`wordsparrow-worker-0` (the only general worker). That leaves **two schedulable
nodes** for app/DB workloads. CNPG pod anti-affinity is `preferred` (soft) with
no explicit `topologyKey`, so with three instances and two nodes every cluster
places **primary + one replica on `worker-0`** and the third replica on
`cp-0`. A `worker-0` reboot takes down the primary and a replica of *every*
database simultaneously, forcing failover onto the control-plane node — the
exact stuck-failover condition this audit began with, cluster-wide.
Root cause: too few worker nodes.

**F2 — No resource requests/limits on any Postgres cluster (critical).**
All five CNPG `Cluster` specs have empty `.spec.resources`, so every DB pod is
**BestEffort QoS** — first to be evicted under node memory pressure. This
matches the observed symptom: the `-pg-1` replicas (all on `worker-0`) have
restarted 9–10× each, all graceful `exit 0` (eviction/restart, not crash).

**F3 — Control-plane node runs workloads and is memory-pressured (high).**
`cp-0` is untainted, so DB replicas schedule onto it; it sits at ~71% memory
while also running etcd/apiserver. The CNPG operator has restarted 20× with
`unable to read ConfigMap … the server is currently unable to handle the
request` — apiserver unavailability traceable to control-plane pressure. A
control-plane node should not carry app load. This fix is **gated on F1**: the
replicas currently on `cp-0` need somewhere else to land before it is tainted.

**F4 — Billing has no HA (high).**
`wordsparrow-billing-api-pg` is `instances: 1` (no replica, no failover) and
`wordsparrow-billing-api` is a single pod. Single point of failure at both
tiers, on the revenue path. (Billing also had no backup until 2026-07-11.)

**F5 — Single-replica app tiers, no PDBs (medium).**
`billing-api`, `game-api`, and `survey-api` run one replica each with no
PodDisruptionBudget, so a node drain or pod restart is downtime for that
service. (`grid`/`api` and `identity` run two.)

**F6 — CNPG operator flapping (medium).**
20 restarts; a symptom of F3, expected to resolve once control-plane pressure
is relieved. Tracked so it isn't mistaken for an independent fault.

### The meta-pattern

Backups, replica counts, anti-affinity, and resource specs were each
configured to *look* correct and none survives a single node loss: three
instances that don't span nodes, a `backups` block with no `ScheduledBackup`,
soft anti-affinity unsatisfiable with two nodes, empty resource specs. The
common remedy is to **validate each HA/DR control against the failure it
claims to protect against**, not just to declare it.

## Decision

Remediate in dependency order. Node capacity (R1) unblocks R3 and R4.

| # | Item | Addresses | Type | Status |
|---|------|-----------|------|--------|
| R0 | `ScheduledBackup` on all service db-charts + one-off base backups taken | backup gap | chart (#1519) + ops | **Done 2026-07-11** |
| R1 | Add 1–2 worker nodes | F1 (and unblocks R3/R4) | terraform (ADR-0010/0011) | Todo |
| R2 | Set resource requests/limits on all CNPG clusters | F2, F6 | chart | Todo |
| R3 | Taint `cp-0` `node-role.kubernetes.io/control-plane:NoSchedule` | F3 | terraform/bootstrap | Todo — after R1 |
| R4 | Billing DB → `instances: 3`; billing-api → 2 replicas | F4 | chart | Todo — after R1 |
| R5 | 2 replicas + PDB for single-replica app tiers | F5 | chart | Todo |

Notes:
- **R1 is the keystone.** With only two schedulable nodes, soft anti-affinity
  cannot spread three instances and hard anti-affinity would leave a replica
  Pending. Adding worker capacity is what makes the existing `instances: 3`
  actually fault-tolerant; consider also setting an explicit `topologyKey`
  once ≥3 workers exist.
- **R2 should be sized from data, not guessed.** Pull per-pod DB memory over
  the last weeks from SigNoz, plus `cp-0` memory and apiserver request latency
  to confirm the F3 correlation, before committing request/limit values.
- R1/R3 are infra/capacity decisions with a monthly cost; they are the
  maintainer's call. R2/R4/R5 are chart-only and can land independently once
  R1 exists (R4) or immediately (R2, R5).

## Consequences

- **Easier:** surviving a `worker-0` failure without a cluster-wide DB
  outage; DB pods no longer first-to-evict; the control plane stops carrying
  app load; billing gains failover.
- **Harder / cost:** R1 and R3 require provisioning (added node cost) and a
  bootstrap change; tainting `cp-0` (R3) permanently removes it as workload
  capacity, which is only safe once R1 has replaced that capacity.
- **Risk if deferred:** the failure modes are latent, not active — the cluster
  looks healthy today. The realistic trigger is a single `worker-0`
  reboot/upgrade, which would reproduce this morning's incident across every
  database at once. This ADR exists so that risk is tracked, not rediscovered.
