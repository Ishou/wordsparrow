# ADR-0109: Self-healing SNAT DaemonSet for FIP-holder pod egress (extends ADR-0035)

## Status

Accepted.

## Context

Mail-sending workloads are pinned to the FIP holder (#1552) so Brevo
transactional mail (ADR-0092) leaves from the one IP whitelisted on the
Brevo account: the Hetzner floating IP, `116.202.180.82` (ADR-0012,
ADR-0106). Pinning the *pod* to the holder node is not sufficient by
itself: which source address that pod's egress gets NAT'd to is decided
by flannel's `MASQUERADE` rule, which picks whichever address is
`eth0`'s primary — usually the FIP alias, but not guaranteed. `ip route
get` on the live holder shows the kernel actually prefers the primary
DHCP address for routing decisions; only `MASQUERADE`'s
address-primary heuristic happens to yield the FIP today. That heuristic
can silently flip on a DHCP renew, a netplan reapply, or a reboot,
sending legally-required transactional mail (art. L221-13) from a
non-whitelisted IP with no in-cluster signal that anything changed.

ADR-0035 solved the sibling problem — the FIP *alias* on `eth0` being
runtime-only state that a netplan reapply could wipe — by moving the
alias into declarative netplan config. Its own "Out of scope" section
flags exactly the class of problem this ADR addresses:

> The iptables NAT rules are still runtime-applied via the systemd
> unit and are subject to the same class of failure... Migrating them
> to declarative `nftables` config is a follow-up — they have not
> bitten us yet, and the blast radius is narrower.

That follow-up was scoped to the port-6443 PREROUTING/POSTROUTING DNAT
rules `floating-ip-config.service` already owns. This ADR covers a
different, new rule: a POSTROUTING SNAT for general pod egress
(`10.42.0.0/16` → FIP), which did not exist when ADR-0035 was written
and has no declarative equivalent available today (there is no
netplan-style declarative surface for arbitrary iptables NAT rules on
this OS/toolchain).

## Decision

Ship a holder-pinned, self-healing Kubernetes DaemonSet
(`infra/platform/templates/fip-egress-snat-daemonset.yaml`) instead of
a declarative config change, for reasons that specifically do not apply
to the netplan case ADR-0035 solved:

- **Must cover the current holder without recreating the node.**
  `server.tf`'s `lifecycle { ignore_changes = [user_data] }` (ADR-0035
  §Consequences) means a cloud-init/netplan change never reaches an
  already-provisioned node without a taint+reprovision. A DaemonSet
  applies immediately via `helm upgrade`.
- **No declarative surface exists for this rule.** Netplan declares
  addresses and routes, not arbitrary `iptables -t nat` rules; there is
  no equivalent "declare this SNAT rule, have the OS reapply it"
  primitive available here today.
- **Self-heals** by re-asserting every 30s if a flannel or kube-proxy
  resync ever drops the rule — the same robustness goal as ADR-0035's
  declarative approach, achieved by re-assertion instead of by moving
  the state into a config file the OS itself reapplies.
- **Follows the FIP automatically** to any recreated holder via the
  existing `bliss.io/fip-holder=true` node label (ADR-0106) — no
  separate migration step when the holder changes.
- **Configure-in-cluster, not host-filesystem.** The DaemonSet is
  Helm-managed like the rest of `infra/platform`, touches no host
  files, and needs no cloud-init/terraform change to deploy or roll
  back.

Rule shape, asserted idempotently every 30s via
`iptables -t nat -C ... || iptables -t nat -I POSTROUTING 1 ...`:

```
-s 10.42.0.0/16 -m mark ! --mark 0x4000/0x4000 ! -d 10.0.0.0/8 -j SNAT --to-source <FIP>
```

It excludes kube-marked traffic (`0x4000`) and internal `10.0.0.0/8`
ranges (pod-to-pod, cluster services, private networking), mirroring
flannel's own `RETURN` rules so cluster-internal traffic is untouched.
It inserts at `POSTROUTING` position 1 to stay ahead of flannel's own
jump; flannel's resync only touches its own chain, so this rule
survives that resync undisturbed.

Disabled by default (`fipEgressSnat.enabled: false`); prod enables it
and sets `floatingIp` explicitly (`values-prod.yaml`).

## Consequences

**Easier:**

- Outbound mail's source IP becomes an explicit, self-asserted
  invariant instead of an accidental side effect of flannel's
  address-primary heuristic — closing the same category of gap
  ADR-0035 closed for the FIP alias, this time for pod-egress SNAT.
- No coordination with a node reprovision is needed to fix or roll
  back the rule; it is a `helm upgrade`/pod-restart away.

**Harder:**

- A second privileged, runtime-applied iptables surface now exists
  alongside ADR-0035's systemd unit (which still owns the port-6443
  DNAT rules) — two independent owners of the host's `nat` table
  instead of one, each re-asserting on its own schedule.
- The DaemonSet runs `hostNetwork: true` with `NET_ADMIN` and
  `runAsUser: 0` on the same node that serves all public ingress
  (ADR-0106) — the highest-value node in the cluster from a blast-radius
  standpoint. Least-privilege tightening for this container (drop all
  capabilities except `NET_ADMIN`, no privilege escalation) is applied
  in the implementation PR review, mirroring the `cnpg-volume-gc`
  job's baseline.
- The rule's *position* (ahead of flannel's jump) is asserted by the
  insert (`-I POSTROUTING 1`), not verified on the recheck loop — the
  loop only checks the rule is *present*, not that it is still first.
  If a future flannel/kube-proxy version changes its own insertion
  behavior such that it ends up ahead of this rule, mail egress could
  silently misroute again with no alert (same class of invisible
  failure ADR-0035 and ADR-0106 both flag for this network layer).

**Different:**

- This is a deliberate, reviewed departure from ADR-0035's "prefer
  declarative config over a runtime-reapplied loop" default, scoped
  narrowly to a rule type that has no declarative equivalent here.
  ADR-0035's underlying preference is unchanged for anything that
  *does* have a declarative surface (e.g. the FIP alias itself).

## Notes

Out of scope, tracked separately (carried forward from ADR-0035's own
"Out of scope" section):

- Migrating this SNAT rule to declarative `nftables` config, if/when
  the OS/toolchain gains a reliable declarative primitive for
  arbitrary NAT rules that survives the same reapply events netplan
  handles for addresses.
- An external blackbox probe verifying outbound mail's actual source
  IP end-to-end (e.g. via a periodic authenticated send-and-check) —
  the same detection-layer gap ADR-0035 and ADR-0106 flag for their
  respective failure classes; a probe would catch a silent ordering
  regression (see Harder, above) that the in-pod recheck loop cannot.
