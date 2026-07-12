# ADR-0109: SNAT the FIP holder's pod egress to the floating IP, maintained by a self-healing DaemonSet

## Status

Accepted. Amends the "iptables NAT rules stay runtime-applied" scope note in
[ADR-0035](./0035-floating-ip-netplan-alias.md).

## Context

Outbound transactional mail goes through Brevo ([ADR-0092](./0092-brevo-transactional-email.md)),
and it is a legal-obligation path: email-OTP login is time-critical, and
billing's durable-medium notices are mandated (art. L221-13). Brevo enforces an
**IP allowlist** — requests from an unlisted source IP are rejected even with a
valid API key — and the maintainer's position is that dropping that allowlist is,
for legal mail, as unacceptable as delivery flakiness. So the allowlist stays,
and every mail send must leave from a single, stable, whitelisted IP.

The mail-sending workloads (`identity-api`, `billing-api`, and billing's
`email-outbox-drain` / `renewal-notices` cronjobs) are pinned to the FIP holder
(`bliss.io/fip-holder=true`, [ADR-0106](./0106-fip-holder-is-worker-zero-only.md)),
and the ingress floating IP ([ADR-0035](./0035-floating-ip-netplan-alias.md)) is
the one IP whitelisted on Brevo. The remaining problem is **which source IP the
holder's pod egress actually presents**: flannel's `MASQUERADE` uses whichever
address is `eth0`'s interface-primary, which today is the FIP but only by an
accident of address ordering. Verified on the live holder, `ip route get`
prefers the *primary DHCP* IP; the FIP wins only through MASQUERADE's
address-primary heuristic, which can **silently flip** on a DHCP renew, a netplan
reapply, or a reboot re-adding addresses — sending legal mail from a
non-whitelisted IP with no cluster-internal signal, exactly the invisible-failure
class ADR-0035 describes.

ADR-0035 moved the FIP *alias* from a runtime `ip addr add` to a declarative
netplan dropin after the 2026-05-10 incident wiped the runtime alias. It
deliberately left the **iptables NAT rules** (`floating-ip-config.sh`:
FIP:6443 DNAT + reply MASQUERADE) runtime-applied, flagging a declarative
migration as a follow-up. The egress fix we need is another NAT-table rule, so it
falls under that same runtime-NAT scope — but it must not repeat the
wipe-fragility that bit the alias.

## Decision

Force the holder's pod egress to source from the FIP with an **explicit SNAT**
rule, maintained by a **self-healing platform-chart DaemonSet**
(`infra/platform/templates/fip-egress-snat-daemonset.yaml`):

- Pinned to `bliss.io/fip-holder=true`, `hostNetwork`, `NET_ADMIN` (the minimum
  to write the host nat table). It idempotently asserts
  `-s 10.42.0.0/16 -m mark ! --mark 0x4000/0x4000 ! -d 10.0.0.0/8 -j SNAT
  --to-source <FIP>` at `-I POSTROUTING 1` and **re-checks every 30 s**. The rule
  excludes kube-marked and internal `10/8` traffic, mirroring flannel's own
  RETURNs, and stays ahead of the flannel jump; flannel resyncs only its own
  chain, so the rule survives.
- Image is digest-pinned in `values-prod.yaml`, per this chart's convention.

**Why a self-healing DaemonSet, not the alternatives:**
- *cloud-init* cannot reach the **current** holder (`ignore_changes=[user_data]`),
  is applied once at boot, and does not self-heal — the alias's original failure
  mode.
- *Declarative nftables* would fight flannel/kube-proxy, which own and resync the
  `nat` table on this k3s cluster; an out-of-band declarative overlay is not a
  supported k3s posture and would drift on every resync.
- The **30 s re-assert** is precisely the cure for the wipe-fragility ADR-0035
  warned about — applied to a NAT rule that ADR-0035 already accepts as
  runtime-managed, rather than to the alias (which stays declarative). The
  DaemonSet also follows the FIP to any recreated holder and touches no node
  filesystem — the configure-in-cluster pattern.

## Consequences

- Mail egress from the holder is **deterministically** the whitelisted FIP; the
  Brevo allowlist stays a single IP, with no per-node whitelisting toil and no
  silent flip.
- A new runtime dependency (`nicolaka/netshoot`, digest-pinned) and a privileged
  DaemonSet (`NET_ADMIN`, `hostNetwork`, root) run on the ingress node — the
  minimum to manage the host nat table. Blast radius is one node, one nat rule,
  re-asserted; a bad rule is idempotent and reversible.
- The rule survives reboots, flannel/kube resyncs, and holder recreation without
  manual intervention.
- ADR-0035's "NAT rules stay runtime-applied" note now has one explicitly
  managed, self-healing member (this SNAT). A future declarative-nftables
  migration, if k3s posture allows, would supersede both this and the
  `floating-ip-config.sh` NAT rules together.
