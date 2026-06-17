# ADR-0070: Garbage-collect orphaned Hetzner volumes left by CNPG churn

## Status
Accepted

## Context
The `hcloud-volumes` StorageClass uses `reclaimPolicy: Retain` (ADR-0009),
chosen so an accidental PVC deletion never destroys a database's only data
copy. CloudNativePG, however, deletes and recreates replica PVCs as a matter
of routine — on failover, on operator instance-manager rollouts, and on
declarative major upgrades. Each deletion leaves the PV `Released` and, under
`Retain`, its backing Hetzner volume is never reclaimed.

Over months these accumulate silently. On 2026-06-17 the project held 28
orphaned `Released` PVs totalling 520Gi (the `game` database alone accounted
for 15). The grid 17→18 major upgrade then provisioned fresh replica volumes,
tipped the Hetzner account over its volume-size quota, and the third grid
replica hung unschedulable with `volumes size limit exceeded`. The cluster
stayed HA at 2/3, so it was not an outage, but the quota is a shared, silent
failure surface for every database.

This is the "three patches = the shape is wrong" trigger: manually deleting
orphans each time the quota fills is a patch, not a fix.

## Decision
Add a weekly `CronJob` to the `platform` umbrella chart that reclaims
long-orphaned volumes by flipping their PVs from `Retain` to `Delete`, letting
Kubernetes' own PV reclaim controller invoke the CSI to delete the backing
Hetzner volume and the PV object.

Key properties:
- **Token-free.** It does not call the Hetzner API and needs no `hcloud`
  credential. Patching a `Released`+`Retain` PV to `Delete` is sufficient; the
  in-tree PV controller drives the CSI `DeleteVolume`. The CSI refuses to
  delete an attached volume, so a live database volume can never be reclaimed.
- **Scoped.** Only PVs that are `Released`, currently `Retain`, and on the
  `hcloud-volumes` StorageClass are considered. A live volume is always
  `Bound`+attached and is never a candidate.
- **Graced.** A candidate is annotated `first-seen-released` on first sight and
  only reclaimed once it has stayed `Released` past `graceSeconds` (default
  7 days). This prevents racing in-flight replica churn, where a PV is briefly
  `Released` before CNPG rebinds a replacement.

`Retain` stays the StorageClass default — the primary volume's safety is
unchanged. The alternative, switching replica volumes to `Delete`, was
rejected: CNPG does not cleanly separate primary from replica StorageClasses,
so it would risk auto-deleting a primary on a mistaken PVC deletion.

## Consequences
- Orphaned volumes self-clean within ~1–2 weeks of going `Released`; the quota
  stops drifting upward without operator intervention.
- The grace window means a freshly orphaned volume lingers up to `graceSeconds`
  before reclaim — acceptable, and the safe direction to err.
- The CronJob has cluster-wide `get/list/patch` on `persistentvolumes`. It has
  no `delete` and no Hetzner credential, so its blast radius is "change a PV's
  reclaim policy" — and only on volumes that are already `Released`.
- Ships disabled by default (`volumeGc.enabled: false`); `values-prod.yaml`
  enables it. The image digest is manually pinned in `values-prod.yaml`;
  Renovate keeps it current thereafter.
