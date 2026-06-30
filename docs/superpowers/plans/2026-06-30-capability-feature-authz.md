# Capability-based feature authorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Bliss-native execution:** this repo runs multi-PR rollouts via the `dispatch`
> skill under the PR-wave discipline — **each wave is §6a-reviewed and merged
> before its dependents start**; later waves may be reshaped by review. The
> terminal artifact of each wave is a merged PR that passes all CI gates and §6a.

**Goal:** make capabilities the single feature-authorization primitive across the
three role-differentiating features (hint, contribuer, billing). Identity owns the
`role → capability` mapping including the guest (`null`) path; consumers gate on
capabilities, never on role or auth-status directly; the server enforces, the
frontend gates cosmetically.

**Architecture:** generalise ADR-0078's billing capability posture to all gated
features. Identity's `capabilitiesFor(role: Role?)` is the one policy function;
`whoami` / `/me` already serialize `capabilities` (no DTO change); enforcing
contexts (grid, survey) read capabilities from identity `whoami` exactly as
billing's `IdentityClient.SessionPrincipal` already does — no cross-context
imports.

**Source ADR:** `docs/adr/0079-capability-based-feature-authorization.md`
**Source spec:** `docs/superpowers/specs/2026-06-30-capability-feature-authz-design.md`

## Global Constraints

Every task implicitly includes these (from CLAUDE.md / the spec):

- **PR cap:** 400 lines of diff (excl. generated + blank), one workstream per PR.
  Cap-override is authorized with written justification (standing grant).
- **Commits:** conventional, bounded-context scope, **DCO sign-off (`-s`)**. Types:
  `feat fix chore refactor test docs`. No `--no-verify`, no `--no-gpg-sign`.
- **Branches:** `<type>/<short-description>`.
- **Hexagonal:** `domain/` depends on nothing; **no cross-context imports** —
  read capabilities over identity `whoami`. Enforced by Konsist.
- **TDD for domain logic**, near-100% mutation coverage; **property-based** tests
  for the capability deserialisation (absent ⇒ empty ⇒ deny).
- **Server-side enforcement is the source of truth; frontend gates are cosmetic.**
- **Comments:** one line, non-obvious WHY only; no multi-line comment blocks.
- **French copy uses tutoiement** for any user-facing strings touched.

## Wave table

| Wave | Title                 | Depends on | Parallel with | PR scope                                  |
|------|-----------------------|------------|---------------|-------------------------------------------|
| 1    | Governance            | —          | —             | ADR-0079 + spec + this plan + INDEX.md    |
| 2    | Identity foundation   | W1         | —             | `Capability.kt` + `capabilitiesFor` + tests |
| 3    | Frontend gating       | **W2**     | W4            | `useHintGate` + contribuer gate via `useCapability` |
| 4    | Backend enforcement   | **W2**     | W3            | survey contribuer + grid hint enforcement |

> **Wave 2 is the barrier.** Waves 3 and 4 both consume the capability vocabulary
> (`hint`, `contribuer`) that Wave 2 introduces; neither can start until Wave 2
> merges. Once Wave 2 is in, Waves 3 and 4 run in parallel (frontend vs backend,
> no shared files).

---

## WAVE 1 — Governance (this PR)

**Branch:** `docs/capability-feature-authz`.
**PR scope:** ADR-0079 + spec + this plan + INDEX.md. Docs-only; invoke the
cap-override (justification: single governance workstream, no code — ADR-0001 §7
lets the ADR ship with its spec/plan).
**Why first:** ADR-0001 §7 — the ADR governing the capability model must merge
before any implementation.

- ADR-0079 (`Status: Accepted`), the design spec, this plan, and the INDEX.md
  binding rows (below) land together.
- `registry-coherence` (ADR ↔ INDEX) must be green — the key gate for this PR.

---

## WAVE 2 — Identity foundation (the barrier; merge before W3 & W4)

**Branch:** `feat/identity-capability-matrix` (off `origin/main` after W1).
**PR scope:** `Capability.kt`, `CapabilityTest.kt`, and the two callers. TDD.
**Why the barrier:** introduces the `hint` / `contribuer` capability vocabulary
and the guest (`null`) path that both downstream waves gate on.

**Files:**
- Modify: `identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt`
- Modify: `identity/domain/src/test/kotlin/com/bliss/identity/domain/user/CapabilityTest.kt`
- Modify: `identity/application/src/main/kotlin/com/bliss/identity/application/usecases/WhoAmIUseCase.kt`
- Modify: `identity/application/src/main/kotlin/com/bliss/identity/application/usecases/GetMeUseCase.kt`

**Tasks:**
- [ ] **Failing test first** — extend `CapabilityTest.kt` for the full matrix:
  `capabilitiesFor(null) == emptySet()`, `capabilitiesFor(PLAYER) == {HINT}`,
  `capabilitiesFor(MAINTAINER) == {HINT, CONTRIBUER, BILLING_SUBSCRIBE}`. Assert
  each enum's `wire` id (`"hint"`, `"contribuer"`, `"billing:subscribe"`).
- [ ] Add `HINT("hint")` and `CONTRIBUER("contribuer")` to the `Capability` enum.
- [ ] Change the signature to `capabilitiesFor(role: Role?)` with the `null → {}`
  branch; PLAYER → `{HINT}`; MAINTAINER → all three. One-line WHY comment on the
  `null` = guest branch.
- [ ] Update the two callers for the nullable signature (they always pass a real
  `Role`, so this is a type-compat touch, not a behavior change).
- [ ] **Verify:** `./gradlew :identity:domain:test :identity:application:test
  --parallel` green; Konsist arch tests green; Spotless clean.

**whoami / `/me` auto-expose** the new capabilities — `WhoAmIResponse` /
`MeResponse` already serialize `capabilities: List<String>`. **No DTO, OpenAPI, or
drift change** — the `openapi-typescript-drift` gate is a no-op for this wave.

---

## WAVE 3 — Frontend gating (after W2; parallel with W4)

**Branch:** `refactor/frontend-capability-gates` (off `origin/main` after W2).
**PR scope:** generalise the capability gate; repoint `useHintGate` and the
contribuer gate; update tests. Billing stays as-is.
**Layer rules:** eslint-plugin-boundaries (ADR-0002); a11y baseline (ADR-0050).

**Files:**
- Modify: `frontend/src/ui/components/auth/useHintGate.ts`
- Modify: `frontend/src/ui/routes/contribuer.lazy.tsx`
- Reference (pattern): `frontend/src/ui/v2/useBillingGate.ts`,
  `frontend/src/ui/components/billing/useCapability.ts`
- Modify: the corresponding vitest specs.

**Tasks:**
- [ ] Generalise the `useBillingGate` shape into a `useCapability`-based gate (or
  point each per-feature gate straight at `useCapability(cap)`).
- [ ] Refactor `useHintGate` to gate on `useCapability('hint')`. Net behavior
  unchanged (guest no `hint` ⇒ deny; authed player holds `hint` ⇒ allow), now
  capability-explicit.
- [ ] Gate the `/contribuer` route/section on `useCapability('contribuer')`
  (maintainer-only) — removes the player-visible "Corriger" entry.
- [ ] Update tests so hint + contribuer assert against `useCapability`, not raw
  auth. **Verify:** `pnpm test`, `pnpm typecheck`, `pnpm a11y` green;
  eslint-boundaries clean.

---

## WAVE 4 — Backend enforcement (after W2; parallel with W3)

**Branch:** `feat/capability-enforcement-survey-grid` (off `origin/main` after W2).
**PR scope:** survey contribuer enforcement + grid hint enforcement. TDD;
Konsist-clean; **no cross-context imports** (read capabilities over identity
`whoami`, mirror billing `SessionPrincipal`).

> If the survey + grid changes together exceed the 400-line cap, split into
> **W4a survey** and **W4b grid** (independent contexts, no shared files) and
> invoke the cap-override only if a single context's slice still exceeds it.

**Files — survey:**
- Modify: `survey/infrastructure/src/.../identity/IdentityClient.kt`
- Modify: `survey/infrastructure/src/.../identity/CachedSessionVerifier.kt`
- Modify: `survey/api/src/.../routes/SubmitRatingRoute.kt`
- Modify: `survey/api/src/.../routes/MeContributionsRoute.kt`
- Modify: `survey/api/src/.../routes/MePreferencesRoute.kt`

**Files — grid:**
- Modify: `grid/application/src/.../auth/WhoAmI.kt`
- Modify: `grid/api/src/.../routes/PuzzleRoute.kt`

**Tasks — survey (contribuer, maintainer-only):**
- [ ] Extend `IdentityClient` / `CachedSessionVerifier` to parse and carry
  `capabilities` from identity `/v1/auth/whoami`, returning a principal
  `(userId, capabilities)` — mirror billing's `SessionPrincipal`. Absent
  capabilities ⇒ empty set ⇒ deny (property-based parse test).
- [ ] Enforce the `contribuer` capability on `SubmitRatingRoute` (the rating POST,
  previously anon-allowed), `MeContributionsRoute`, `MePreferencesRoute` — a caller
  without it gets `403`. **Failing test first** proving a non-maintainer caller is
  rejected and a maintainer passes.
- [ ] Keep the existing 30 s session-verification cache.

**Tasks — grid (hint):**
- [ ] Extend `WhoAmI` to carry `capabilities` (same identity `whoami` source the
  session verification already uses).
- [ ] Assert the `hint` capability on `POST /v1/puzzles/{id}/hints`. Boundary
  coincides with today's authed-only behavior; **failing test first** proving a
  caller without `hint` is rejected and a holder passes.
- [ ] **Verify:** `./gradlew :survey:...:test :grid:...:test --parallel` green;
  Konsist + Spotless clean.

---

## Self-Review

**ADR coverage** — every ADR-0079 decision maps to a wave: capability primitive +
matrix + guest path (W2); minimal-set / universal-features-stay-open (W2 mapping);
frontend cosmetic gates (W3); server-side enforcement for hint (W4 grid) and
contribuer (W4 survey); cross-context whoami source with absent ⇒ deny (W4);
billing unchanged (no wave). The flagged contribuer behavior change and the GA
promotion note are documented, not implemented here.

**Barrier check** — W2 is the sole prerequisite for W3 and W4; W3 and W4 touch
disjoint files (frontend vs survey/grid) and run in parallel after W2 merges.

**Type consistency** — `Capability` wire ids align across waves: `hint`,
`contribuer`, `billing:subscribe`; `capabilitiesFor(role: Role?)` signature is
identical in domain (W2) and implied by every consumer's `useCapability(cap)` /
`SessionPrincipal.capabilities` read (W3/W4); no DTO/schema change in any wave.
