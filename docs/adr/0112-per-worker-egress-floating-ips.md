# ADR-0112: Every worker gets a dedicated egress floating IP, so mail-sending workloads stay HA-spread instead of pinned to the holder (amends ADR-0106, ADR-0109)

## Status

Accepted.

## Context

ADR-0109 made outbound mail leave from the one Brevo-whitelisted floating
IP deterministically, but only from the **FIP holder** (`worker[0]`): the
SNAT DaemonSet is holder-pinned (`bliss.io/fip-holder=true`) and SNATs to a
single hardcoded IP. To guarantee that determinism, every mail-sending
workload — `identity-api` (OTP, magic links), `billing-api` (invoices,
dunning), `survey-api` (harm-report alerts), the mail cronjobs — is pinned
to the holder node too (#1552).

That pinning is the problem. It concentrates load on `worker[0]` (the same
node that already serves *all* public ingress per ADR-0106), and it defeats
the HA the three-worker topology (ADR-0101 R1) was supposed to buy: a CNPG
replica or an API replica that the scheduler would otherwise spread across
workers cannot land on `worker[1]`/`worker[2]` if it needs to send mail,
because those nodes have no whitelisted egress path. Mail is a legal
obligation (art. L221-13) with a zero-flakiness bar; "spread the replicas
but keep mail on one node" is a contradiction that surfaces the first time
`worker[0]` is drained, overloaded, or lost.

ADR-0106 §1 is why non-holders had no egress path: the worker cloud-init
aliased the **shared ingress FIP** onto every worker, and because Hetzner
routes that FIP's return traffic to its single assigned holder, a non-holder
aliasing it black-holed its own pod egress. ADR-0106 fixed that by making
non-holders alias *nothing* (`floating_ip = ""`). That correctly removed the
black hole, but it also left non-holders with no stable, whitelistable
egress identity at all — which is what pins mail to the holder.

## Decision

Give **each** worker its own dedicated Hetzner floating IP, assigned to that
specific server, and SNAT each worker's pod egress to its own FIP. Then any
worker can send whitelisted mail, so mail workloads no longer need holder
pinning.

1. **Per-worker egress FIPs** (`floating-ip.tf`). `worker[0]` reuses the
   existing ingress FIP (`hcloud_floating_ip.ingress`, already whitelisted)
   for egress. Each `worker[i>0]` gets a dedicated
   `hcloud_floating_ip.worker_egress[i-1]`, **assigned to that server**
   (`hcloud_floating_ip_assignment.worker_egress`). Because each egress FIP
   is assigned to the node that aliases it, Hetzner routes its return
   traffic back to that node — no black hole (the exact failure ADR-0106 §1
   hit only because the *shared* FIP was aliased on a non-assigned node).
   Every worker thus aliases **exactly one** FIP.

2. **Non-holders now alias their own FIP** (`server.tf`,
   `worker.yaml.tftpl`) — this amends ADR-0106 §2. The netplan alias dropin
   is gated on `floating_ip != ""` (every worker has one now), but the
   ingress `:6443` DNAT, the `floating-ip-config.service`, and the
   `bliss.io/fip-holder` label stay gated on `fip_holder` (`worker[0]`
   only). A non-holder's FIP is **egress-only**: aliased for SNAT, no DNAT.

3. **The SNAT DaemonSet runs on every node and discovers its own FIP**
   (`fip-egress-snat-daemonset.yaml`) — this amends ADR-0109. It drops the
   `bliss.io/fip-holder` nodeSelector and the hardcoded `floatingIp` value.
   Each pod discovers the node's FIP as the global `eth0` address that is
   *not* the default-route source (the DHCP primary), and SNATs pod egress
   to it. A node that aliases no FIP (control-plane, observability) finds
   none and idles. Discovery runs in the assert loop, so it survives the
   boot race (netplan alias landing after the pod starts) and follows a FIP
   that moves under a recreated node. The rule shape is unchanged from
   ADR-0109.

All worker egress FIPs must be on the Brevo "Authorized IPs" allowlist
(dashboard-only; ADR-0092/0094). Adding a worker means allowlisting its new
egress FIP before mail can leave from it.

This ADR provisions and spreads the egress capability. **Removing the mail
workloads' holder pin (`identity-api`, `billing-api`, `survey-api`, the mail
cronjobs) is a separate follow-up** — expand here (make every worker
mail-capable), contract there (drop the pins). Until then this change is
inert for mail routing and harmless: the holder still sends as it does today.

## Consequences

**Easier:**

- Mail can leave from any worker with a deterministic, whitelisted source
  IP — the precondition for un-pinning mail workloads and letting CNPG /
  API replicas spread across all three workers (ADR-0101 R1's actual HA).
- The DaemonSet is now self-describing: it SNATs to whatever FIP a node
  aliases, with no per-node config and no hardcoded IP to drift. Adding a
  worker needs no DaemonSet change.
- Non-holders regain a stable egress identity without reintroducing the
  ADR-0106 §1 black hole, because each FIP is assigned to the node that
  aliases it.

**Harder:**

- The Brevo allowlist now has N entries (one per worker) instead of one.
  Each is dashboard-managed with no API, so worker-count changes carry a
  manual allowlist step — a new failure mode if forgotten (mail from an
  un-whitelisted new worker is rejected). Tracked as an operational note in
  the deploy runbook.
- More privileged surface: the `hostNetwork`/`NET_ADMIN` SNAT pod now runs
  on every node, not just the holder (control-plane and observability
  included, where it idles). The least-privilege container hardening from
  ADR-0109 (drop all caps except `NET_ADMIN`, no privilege escalation) is
  retained.
- FIP discovery depends on the DHCP primary being the default-route source
  and the FIP being a static secondary on `eth0`. That holds for the
  Hetzner + netplan setup here (ADR-0035), but it is a runtime heuristic,
  not a declared fact — the same class of invisible-if-it-drifts risk
  ADR-0109 already flags for the rule's *position*.

**Different:**

- ADR-0106's "non-holder workers no longer carry a network alias they don't
  use" consequence is superseded: non-holders now carry exactly one alias —
  their own egress FIP — which they *do* use. ADR-0106's core invariant is
  unchanged: still exactly one **ingress** FIP holder (`worker[0]`), still
  the only node with the `:6443` DNAT and the `ingress-nginx` placement.
- ADR-0109's holder-pinned, single-IP SNAT becomes per-node, self-
  discovering SNAT. Its self-healing re-assertion mechanism is unchanged.

## Notes

Out of scope, tracked separately:

- Removing the mail workloads' holder pin (Phase 3) — the payoff this ADR
  enables, deliberately split so the egress capability lands and is
  verified before the pins come off.
- Automating the Brevo allowlist on worker-count change — no Brevo API for
  authorized IPs exists (ADR-0092/0094); stays a manual runbook step.
- An external blackbox probe verifying each worker's actual outbound mail
  source IP end-to-end — carried forward from ADR-0109/0035; now N times as
  useful since there are N egress IPs to keep whitelisted.
