# ADR-0071: Dependency install cooldown (minimumReleaseAge)

## Status
Accepted

## Context
The most common npm/pnpm supply-chain attack is a compromised maintainer
account publishing a malicious version that is live for hours before it is
detected and yanked. Installing a package within that window is the exposure.
pnpm 11.7 ships a defence — `minimumReleaseAge` — that refuses to resolve or
verify any dependency version younger than a threshold; it is enabled by
default (1440 min) in 11.7 and applies to all dependencies, transitive ones
included, at both resolution and frozen-lockfile verification.

This surfaced via PR #992 (pnpm 11.0.9 → 11.7.0): once 11.7 lands, every
`pnpm install --frozen-lockfile` in CI starts enforcing the gate. Without a
matching policy on the Renovate side, Renovate (which has no cooldown today —
`prCreation: immediate`, no `minimumReleaseAge`) would keep opening PRs for
sub-threshold versions that pnpm then refuses to lock, producing red PRs. The
two layers must agree.

The gate also creates a real tension: a critical CVE patch is *itself* a fresh
publish — the exact shape the cooldown blocks. A naive cooldown would delay
day-1 security response by up to the threshold.

## Decision
Adopt a 24h install cooldown, configured explicitly and aligned across both
layers so neither relies on an implicit default:

- **pnpm** (`frontend/pnpm-workspace.yaml`): `minimumReleaseAge: 1440`. This is
  the load-bearing gate — it covers transitive resolution, which Renovate's
  config cannot see. An empty `minimumReleaseAgeExclude: []` is the documented
  escape hatch.
- **Renovate** (`renovate.json`): `minimumReleaseAge: "1 day"` +
  `internalChecksFilter: "strict"` so Renovate holds (not just flags) a
  sub-threshold release and never opens a PR pnpm would reject.

**Security updates bypass the cooldown.** `vulnerabilityAlerts` gains
`minimumReleaseAge: "0"` + `internalChecksFilter: "none"`, so advisory-driven
PRs are raised immediately. pnpm's gate is CVE-blind, so the day-1 path is a
deliberate, auditable human action, not an automated bypass:

> **Day-1 CVE runbook.** When a critical advisory's fix is younger than 24h:
> 1. A maintainer reads the advisory and confirms the patched version is the
>    legitimate upstream fix (not a look-alike / typosquat).
> 2. Add the exact `pkg@version` to `minimumReleaseAgeExclude` in
>    `frontend/pnpm-workspace.yaml`.
> 3. A second reviewer approves the exclude line; merge.
> 4. Drop the exclude entry on the next dependency PR once the version ages out.

24h (not 3 days) is chosen deliberately: it neutralises the fresh-malware
window — where most malicious publishes are caught and yanked — while keeping
the worst-case emergency-patch delay to a single human-in-the-loop step.

## Consequences
- Sub-24h versions never enter the lockfile silently; CI's frozen-lockfile
  verify stays green because Renovate and pnpm agree on the floor.
- A genuine day-1 CVE patch is gated behind the runbook above — friction by
  design, landing exactly where human judgement is wanted rather than
  auto-merging a fresh package unattended.
- The exclude list is auditable in git history; each entry records a conscious
  "we trust this specific fresh version" decision tied to an advisory.
- Renovate PRs for fresh non-security bumps appear up to 24h later; acceptable
  for routine maintenance.
