# ADR-0106: The floating IP has exactly one holder — worker[0] — and only worker[0] gets its alias, DNAT, and ingress-nginx placement

## Status

Accepted.

## Context

ADR-0012 assigned the cluster's Hetzner floating IP (FIP) to
`hcloud_server.worker[0]` for v1, when `worker_count` was always 1 — "the
worker" and "the FIP holder" were the same node by construction. ADR-0101 R1
raised `worker_count` to 3 to fix the single-failure-domain DB problem, and
that broke the implicit assumption in two places at once:

**1. Pod-egress black hole on non-holder workers.** The worker cloud-init
(`worker.yaml.tftpl`) aliased the FIP onto **every** worker's `eth0`, not
just `worker[0]`'s — because until R1 there was only ever one worker to
alias it on. On a non-holder worker, pod-egress masquerade picked the FIP as
the source address; Hetzner routes the FIP's replies to its assigned holder
(`worker[0]`), so the non-holder's outbound pod traffic never got its
response back. Host-network egress was unaffected (it uses the real IP via
the default route), so the failure was invisible to node/pod health and hit
only regular pod egress: the corpus-fetch init container
(`grid-api` replicas, `ensure-dailies` cron) and `hcloud-csi-node`
(metadata-service timeout → no volume mounts). Latent until `worker_count >
1`; surfaced on the R1 scale-up.

**2. ingress-nginx placement is no longer guaranteed to match the alias.**
`infra/platform/values-prod.yaml`'s `ingress-nginx.controller.nodeSelector`
was `bliss.io/role: worker`, and every `hcloud_server.worker[i]` carries that
label regardless of index (`server.tf`, `worker.yaml.tftpl` node-label
block). With one worker this was equivalent to "pin to the FIP holder"; with
three, the k8s scheduler is free to place the (single, `hostNetwork: true`)
ingress-nginx pod on `worker[1]` or `worker[2]` — nodes that, after fixing
(1), no longer have the FIP aliased at all. Hetzner still routes
FIP-destined 80/443 traffic to `worker[0]`; if ingress-nginx is scheduled
elsewhere, nothing listens on the FIP's host ports and public ingress goes
dark cluster-wide. This class of failure stays invisible to cluster-internal
signals (pods `Running`, nodes `Ready`) exactly as ADR-0035 describes for the
alias-wipe incident — the public surface is what breaks, and there is no
in-cluster probe that catches it first.

Both problems share one root cause: **"the FIP holder" stopped being
implicitly equal to "any worker" the moment a second worker joined**, and
nothing encoded that as an explicit, checkable fact.

## Decision

Make the FIP holder an explicit, first-class node label, and gate every
consumer of "is this the FIP holder" on that label instead of on
`bliss.io/role: worker`.

1. **`bliss.io/fip-holder=true`** is set via k3s `node-label` only on
   `worker[0]` (`fip_holder = count.index == 0` passed into
   `worker.yaml.tftpl`; all other workers, including the observability
   worker, get `fip_holder = false` and no label).
2. **The FIP alias, netplan dropin, and iptables DNAT** (`floating_ip`
   template var) are gated on the same `count.index == 0` condition —
   non-holder workers render `floating_ip = ""` and skip that whole
   `write_files`/`runcmd` block (ADR-0035's declarative-netplan mechanism is
   unchanged; only which workers run it changes).
3. **`ingress-nginx.controller.nodeSelector`**
   (`infra/platform/values-prod.yaml`) changes from `bliss.io/role: worker`
   to `bliss.io/fip-holder: "true"`, so the scheduler can only place the
   controller pod on the node that actually has the alias — a reschedule
   (drain, rollout, eviction) can no longer land it on a non-holder worker.
4. **`floating-ip.tf`**'s assignment comment is corrected: the FIP is bound
   to `worker[0]` specifically, not "the worker node" (singular no longer
   holds once `worker_count > 1`).

If the FIP's holder ever changes (a future ADR moving it to a dedicated
ingress node, HA control plane, etc.), the label assignment and the
`hcloud_floating_ip_assignment.ingress.server_id` reference in
`floating-ip.tf` must move together — they are the same fact expressed in
two systems (k8s node label, Hetzner API assignment) and must never diverge.

## Consequences

**Easier:**

- "Is this node the FIP holder" is one grep-able label
  (`kubectl get nodes -l bliss.io/fip-holder=true`), not an inference from
  `worker_count == 1` or reading `floating-ip.tf`.
- ingress-nginx placement and the FIP alias are now the same invariant
  enforced by the same label — they cannot silently diverge the way
  `bliss.io/role: worker` + a growing worker pool did.
- Non-holder workers no longer carry a network alias they don't use,
  removing the pod-egress-masquerade failure mode entirely (not just
  papering over its symptom).

**Harder:**

- Moving the FIP to a different node now requires updating three places in
  lockstep: `floating-ip.tf`'s `server_id`, the `fip_holder` argument passed
  into the relevant `hcloud_server` resource's `templatefile()` call, and
  (implicitly) whichever node is `count.index == 0` for that resource. No
  single source of truth automates this; it is a manual, coordinated change
  same as ADR-0012 §2 already was for the assignment alone.
- Existing prod workers (`worker[1]`, `worker[2]`) need a reprovision
  (`tofu taint` + apply) to pick up the corrected cloud-init — per
  `server.tf`'s `lifecycle { ignore_changes = [user_data] }`, edits to the
  template only apply to new/recreated workers.

**Different:**

- `bliss.io/role: worker` still exists and still means "general app-tier
  worker" (unchanged meaning); `bliss.io/fip-holder` is a narrower,
  orthogonal fact about exactly one node in that set.

## Notes

Out of scope, tracked separately:

- Automatic FIP failover to a new holder on `worker[0]` loss — Hetzner
  reassignment is API-driven but nothing in this cluster triggers it
  automatically today (same posture ADR-0012 §Harder already accepted for
  v1).
- An external blackbox probe for the ingress black-hole class of failure —
  ADR-0035 already flagged this as a follow-up for the alias-wipe case; it
  applies equally here.
