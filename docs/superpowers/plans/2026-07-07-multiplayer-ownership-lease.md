# Multiplayer Ownership Lease — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This repo ships work as small PRs via the dispatch / issue-dev flow (ADR-0069).
> Each **Task** below is one PR / one workstream. Every code task is TDD:
> failing test → minimal impl → green → Spotless/lint → commit. Do not batch
> tasks into one PR — the 400-line cap and "one workstream per PR" rule
> (ADR-0001 §4) are hard.

**Goal:** Make the free multiplayer tier mean "1 active game you own," with a graceful escape, by modelling lobby ownership as a claimable lease.

**Architecture:** Ownership is counted by the sticky `owner_user_id` (ADR-0066), so it survives disconnect and only ends on completion or an explicit relinquish. A relinquished game is *ownerless* and claimable by any present player; ownerless games are GC'd after 7 days. All quota enforcement is app-side under the existing `withUserLock` advisory lock — never a DB constraint.

**Tech Stack:** Kotlin/JVM + Ktor + Postgres (CNPG/Flyway) + Konsist + JUnit5/AssertJ/Kotest/Testcontainers (backend); Vite + React 19 + TanStack Router + Panda + Vitest + MSW (frontend). Schemas: `game/api/openapi.yaml` + `game/api/asyncapi.yaml`.

## Global Constraints

- Spec: **ADR-0098** (this feature). Amends **ADR-0055** (GC matrix + RGPD cascade) and **ADR-0083** (host quota). Read all three before starting; run `scripts/adr-context.sh <path>` for each file you touch.
- "Active" = non-terminal = `WAITING` OR `IN_PROGRESS`. Quota counted by `owner_user_id`. Free = 1 active owned game; `multiplayer:host-unlimited` bypasses; guest = 0.
- Quota is a **create/claim-time gate**, never a DB uniqueness constraint on `owner_user_id`.
- Ownership relinquish is **explicit-only**; the disconnect grace path must NEVER null `owner_user_id`.
- No cross-context imports. No `println`/`console.log`. Conventional commits with bounded-context scope. `git commit -s` (DCO). Branch `<type>/<desc>`.
- Comments: one line, non-obvious WHY only.

---

### Task 1: ADR + amendments (docs, merges first)

**Files:**
- Create: `docs/adr/0098-multiplayer-ownership-lease.md` (already drafted).
- Modify: `docs/adr/0055-multiplayer-game-persistence.md` — add amendment note: RGPD cascade rule 2 becomes "vacate → ownerless"; GC matrix gains 4th rule "ownerless (`owner_user_id IS NULL`) non-terminal idle > 7d → evict".
- Modify: `docs/adr/0083-multiplayer-hosting-entitlement.md` — amendment note: free quota is "1 active game (WAITING or IN_PROGRESS) counted by `owner_user_id`", superseding "1 open (WAITING) lobby"; add claim/relinquish.
- Modify: `docs/adr/INDEX.md` — add ADR-0098 path bindings (see Steps).

**Interfaces:**
- Produces: the ratified contract every later task implements. No code symbols.

- [ ] **Step 1: Confirm ADR-0098 status is `Proposed`; write the two amendment notes** in 0055 and 0083 using each file's existing amendment style (a dated bullet under Decision/Consequences).
- [ ] **Step 2: Add INDEX.md bindings.** Append rows mirroring the existing ADR-0083 block, e.g.:
  ```
  ADR-0098  game/application/**/usecases/LobbyUseCases.kt   Quota = 1 active game (WAITING|IN_PROGRESS) by owner_user_id (findActiveByOwnerUser); explicit relinquish nulls owner_user_id; ClaimLobbyOwnershipUseCase quota-gated
  ADR-0098  game/application/**/usecases/LobbyGarbageCollector.kt   GC gains ownerless (owner_user_id IS NULL) non-terminal idle>7d sweep (amends ADR-0055 matrix)
  ADR-0098  game/api/**/routes/LobbiesRoute.kt   Create counts active owned games; new claim endpoint
  ADR-0098  game/api/**/routes/LobbyWebSocketRoute.kt   Explicit leaveLobby frame relinquishes ownership; disconnect grace keeps it
  ADR-0098  game/infrastructure/**/persistence/PostgresLobbyRepository.kt   findActiveByOwnerUser + findIdleOwnerless; eraseSession rule 2 vacates
  # ADR-0098: Multiplayer lobby ownership as a claimable lease — 1 active game by owner_user_id; relinquish→ownerless→claim; RGPD vacate; 7d ownerless GC
  ```
- [ ] **Step 3: Verify `registry-coherence` locally** — `git diff --stat` shows ADR + INDEX together. Commit.
  ```bash
  git add docs/adr/0098-*.md docs/adr/0055-*.md docs/adr/0083-*.md docs/adr/INDEX.md
  git commit -s -m "docs(adr): ADR-0098 multiplayer ownership lease (+amend 0055,0083)"
  ```

> **Gate:** merge Task 1 (§6a LGTM) before dispatching Tasks 2+ (spec-first, ADR-0069 / memory `feedback_spec_first_then_impl`).

---

### Task 2: Schema — claim endpoint (schema-only PR, merges before producers/consumers)

**Files:**
- Modify: `game/api/openapi.yaml` — add `POST /v1/lobbies/{lobbyId}/ownership` (claim). Request: none/empty (identity from cookie). Responses: `200` (lobby body, same schema as `GET /v1/lobbies/{lobbyId}`), `401` (not signed in), `403` (not present in lobby / already owned), `409` (quota exceeded — you already own an active game), `404`.
- Modify: `game/api/asyncapi.yaml` — if a WS frame should announce ownership change to peers, add an `ownershipChanged` server→client message (ownerless→claimed, and relinquish). Otherwise document that peers learn via the existing lobby-state refresh.
- Modify (generated, by tooling): `frontend/src/infrastructure/api/game/types.ts` via `pnpm api:check`.

**Interfaces:**
- Produces: `POST /v1/lobbies/{lobbyId}/ownership` contract; the `409` "quota exceeded" problem type (reuse ADR-0083's problem-type convention — grep existing `AUTH_REQUIRED_TYPE` for the pattern).

- [ ] **Step 1: Fetch the existing shape first.** Read the current `POST /v1/lobbies` and `GET /v1/lobbies/{lobbyId}` blocks in `game/api/openapi.yaml` and copy their response/`$ref` structure verbatim (memory `feedback_fetch_example_before_authoring_payload`).
- [ ] **Step 2: Add the claim path** mirroring that structure; reuse the `Lobby` schema `$ref` for the 200 body and the existing RFC-7807 problem schema for 401/403/409.
- [ ] **Step 3: Run gates.** `npx @redocly/cli lint game/api/openapi.yaml` (or the repo's `openapi-lint` invocation) and, from `frontend/`, `pnpm api:check`. Both green.
- [ ] **Step 4: Commit** `chore(api-game): add claim-ownership endpoint schema`.

---

### Task 3: Domain — ownership-lease transitions on `Lobby`

**Files:**
- Modify: `game/domain/src/main/kotlin/com/bliss/game/domain/Lobby.kt`
- Test: `game/domain/src/test/kotlin/com/bliss/game/domain/LobbyTest.kt` (or the existing lobby domain test file)

**Interfaces:**
- Produces:
  - `Lobby.isOwnerless(): Boolean` = `ownerUserId == null`.
  - `Lobby.relinquishOwner(now: Instant): Lobby` — returns a copy with `ownerUserId = null`, `lastActivityAt = now`. Does not touch `players`/`ownerSessionId` (seat cleanup is the caller's concern).
  - `Lobby.claimOwner(sessionId: SessionId, userId: UserId, now: Instant): Lobby` — copy with `ownerUserId = userId`, `ownerSessionId = sessionId`, `lastActivityAt = now`. Precondition (caller-enforced): lobby is ownerless and the session is present.

- [ ] **Step 1: Failing test** — ownerless predicate + transitions:
  ```kotlin
  @Test
  fun `relinquishOwner clears ownerUserId and marks ownerless`() {
      val lobby = waitingLobbyOwnedBy(userId = aUserId)   // existing test factory
      val after = lobby.relinquishOwner(now = anInstant)
      assertThat(after.ownerUserId).isNull()
      assertThat(after.isOwnerless()).isTrue()
      assertThat(after.state).isEqualTo(lobby.state)      // state machine untouched
  }

  @Test
  fun `claimOwner sets ownerUserId and ownerSessionId to claimer`() {
      val lobby = waitingLobbyOwnedBy(userId = aUserId).relinquishOwner(anInstant)
      val after = lobby.claimOwner(bSessionId, bUserId, anInstant)
      assertThat(after.ownerUserId).isEqualTo(bUserId)
      assertThat(after.isOwner(bSessionId)).isTrue()
      assertThat(after.isOwnerless()).isFalse()
  }
  ```
- [ ] **Step 2: Run — fails** (methods undefined). `./gradlew :game:domain:test`.
- [ ] **Step 3: Implement** the three methods on `Lobby`. Keep the `init` invariants intact (relinquish/claim never change `state` or `game`, so no invariant risk).
- [ ] **Step 4: Green + Spotless.** `./gradlew :game:domain:spotlessApply :game:domain:test`.
- [ ] **Step 5: Commit** `feat(game-domain): ownership-lease transitions (relinquish/claim/isOwnerless)`.

---

### Task 4: Application — quota query, split leave, claim & relinquish use cases

**Files:**
- Modify: `game/application/src/main/kotlin/com/bliss/game/application/ports/Ports.kt` — add `findActiveByOwnerUser` (replaces the quota's use of `findWaitingByOwnerUser`) and `findIdleOwnerless`.
- Modify: `game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyUseCases.kt`
  - `CreateLobbyUseCase`: swap `findWaitingByOwnerUser` → `findActiveByOwnerUser` (`LobbyUseCases.kt:70`).
  - `LeaveLobbyUseCase`: keep as presence-drop; **must not** touch `ownerUserId` (it already doesn't — confirm and pin with a test).
  - Add `RelinquishOwnershipUseCase(lobbyId, sessionId)`: caller must be current owner → `lobby.relinquishOwner(now)`; also drop the caller's seat.
  - Add `ClaimLobbyOwnershipUseCase(lobbyId, sessionId, userId, hostUnlimited)`: caller present + lobby ownerless + (`hostUnlimited` or `findActiveByOwnerUser(userId) == null`) → `lobby.claimOwner(...)`; else `UseCaseError.QuotaExceeded`.
- Test: `game/application/src/test/kotlin/.../LobbyUseCasesTest.kt`

**Interfaces:**
- Consumes: `Lobby.relinquishOwner/claimOwner/isOwnerless` (Task 3).
- Produces:
  - `LobbyRepository.findActiveByOwnerUser(userId: UserId): Lobby?`
  - `LobbyRepository.findIdleOwnerless(cutoff: Instant): List<Lobby>`
  - `RelinquishOwnershipUseCase.invoke(lobbyId, sessionId): UseCaseOutcome<Lobby?>`
  - `ClaimLobbyOwnershipUseCase.invoke(lobbyId, sessionId, userId, hostUnlimited): UseCaseOutcome<Lobby>`; new `UseCaseError.QuotaExceeded`, `UseCaseError.NotPresentInLobby`, `UseCaseError.AlreadyOwned`.

- [ ] **Step 1: Flip the two existing quota tests** that assert `IN_PROGRESS` is excluded (`LobbyUseCasesTest.kt` "CreateLobby reopens the free player's existing WAITING lobby …"): they must now assert an `IN_PROGRESS` owned game **also** blocks a second create. Add the create-with-`hostUnlimited` bypass case. Run — fails.
- [ ] **Step 2: Add `findActiveByOwnerUser` to the port**, point `CreateLobbyUseCase` at it. Green those tests.
- [ ] **Step 3: Failing test for claim** — present + ownerless + under quota → claims; over quota → `QuotaExceeded`; not present → `NotPresentInLobby`; owned → `AlreadyOwned`. Then implement `ClaimLobbyOwnershipUseCase`.
- [ ] **Step 4: Failing test for relinquish** — owner relinquishes → ownerless + owner's seat gone; non-owner → `NotOwner`. Implement `RelinquishOwnershipUseCase`. Add a regression test that `LeaveLobbyUseCase` leaves `ownerUserId` intact (pins the disconnect-safe rule).
- [ ] **Step 5: Add `findIdleOwnerless` to the port** (used by Task 6). No behaviour here yet; just the signature + KDoc.
- [ ] **Step 6: Green + Spotless + Konsist.** `./gradlew :game:application:spotlessApply :game:application:test`.
- [ ] **Step 7: Commit** `feat(game-application): active-game quota + claim/relinquish ownership lease`.

---

### Task 5: Infrastructure — repository queries + RGPD vacate

**Files:**
- Modify: `game/infrastructure/src/main/kotlin/com/bliss/game/infrastructure/persistence/PostgresLobbyRepository.kt`
- Modify: `game/infrastructure/src/main/kotlin/com/bliss/game/infrastructure/InMemoryLobbyRepository.kt`
- Test: `PostgresLobbyRepositoryTest.kt` (Testcontainers) + `InMemoryLobbyRepositoryTest.kt`

**Interfaces:**
- Consumes: `findActiveByOwnerUser`, `findIdleOwnerless` signatures (Task 4).
- Produces: their implementations + the changed `eraseSession` rule-2 behaviour.

- [ ] **Step 1: Failing Testcontainers test** — `findActiveByOwnerUser` returns a `WAITING` **and** an `IN_PROGRESS` owned lobby (invert the existing `PostgresLobbyRepositoryTest.kt:275` "does not return IN_PROGRESS" test), and returns `null` for a relinquished (`owner_user_id NULL`) lobby.
- [ ] **Step 2: Implement `findActiveByOwnerUser`** by mirroring `findWaitingByOwnerUser` (`PostgresLobbyRepository.kt:367`) but keyed on `owner_user_id` and non-terminal:
  ```sql
  SELECT id FROM lobbies
   WHERE owner_user_id = ? AND state IN ('WAITING','IN_PROGRESS')
   LIMIT 1
  ```
  (Note: keyed on the `owner_user_id` column directly, not the owner-seat join — ownership is sticky per ADR-0066.) Mirror in `InMemoryLobbyRepository` (`state != COMPLETED && ownerUserId == userId`).
- [ ] **Step 3: Failing test + implement `findIdleOwnerless`** — `owner_user_id IS NULL AND state IN ('WAITING','IN_PROGRESS') AND last_activity_at <= ?`. In-memory parity.
- [ ] **Step 4: Failing test for RGPD vacate** — adapt the erasure cascade test: owner erases + others present ⇒ lobby's `owner_user_id` becomes `NULL` (was: transferred to earliest-joined). Update `eraseSession` rule 2 accordingly; `EraseSessionResult` keeps a count field (rename `transferredLobbies` → `vacatedLobbies`, or keep the name with new semantics — pick per reviewer; document on the wire).
- [ ] **Step 5: Green + Spotless.** `./gradlew :game:infrastructure:spotlessApply :game:infrastructure:test`.
- [ ] **Step 6: Commit** `feat(game-infrastructure): active/ownerless queries + RGPD vacate rule`.

---

### Task 6: Garbage collector — 7-day ownerless sweep

**Files:**
- Modify: `game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyGarbageCollector.kt`
- Test: the existing `LobbyGarbageCollectorTest.kt`

**Interfaces:**
- Consumes: `findIdleOwnerless` (Task 4/5).
- Produces: `LobbyGarbageCollector(..., ownerlessTtl: Duration = Duration.ofDays(7))`; `sweepOnce()` also evicts ownerless idle lobbies.

- [ ] **Step 1: Failing test** — an ownerless (`owner_user_id NULL`) `IN_PROGRESS` lobby idle > 7d is evicted by `sweepOnce()`; an *owned* `IN_PROGRESS` idle > 7d is NOT (owned in-progress stays never-evicted-by-idle); a fresh ownerless lobby is NOT.
- [ ] **Step 2: Implement** — add a third `evictAll` block mirroring the WAITING/COMPLETED ones (`LobbyGarbageCollector.kt:57-70`), `candidates = repo.findIdleOwnerless(ownerlessCutoff)`, `requiredState` check relaxed to "non-terminal & ownerless" (add an `stillEligible` predicate `{ it.isOwnerless() && it.state != COMPLETED }` re-checked under the repo's evict guard). Update the GC-matrix KDoc + fix its `ADR-0039`→`ADR-0055` citation.
- [ ] **Step 3: Green + Spotless.** `./gradlew :game:application:spotlessApply :game:application:test`.
- [ ] **Step 4: Commit** `feat(game-application): GC sweep for idle ownerless lobbies (ADR-0098)`.

---

### Task 7: API — claim route + explicit-leave/disconnect split + create wiring

**Files:**
- Modify: `game/api/src/main/kotlin/com/bliss/game/api/routes/LobbiesRoute.kt` — mount `POST /v1/lobbies/{lobbyId}/ownership` (claim); confirm create already computes `hostUnlimited` and now relies on the new `findActiveByOwnerUser` via the use case (no route change beyond the existing capability read).
- Modify: `game/api/src/main/kotlin/com/bliss/game/api/routes/LobbyWebSocketRoute.kt` — the explicit `leaveLobby` frame handler (`:335`) calls `RelinquishOwnershipUseCase`; the disconnect **grace** coroutine (`:505`) keeps calling the presence-drop `LeaveLobbyUseCase` (unchanged — must NOT relinquish).
- Modify: `game/api/src/main/kotlin/com/bliss/game/api/LobbyUseCases.kt` + `Module.kt` — wire the two new use cases.
- Test: `LobbiesRouteTest.kt`, `LobbyWebSocketRouteTest.kt`.

**Interfaces:**
- Consumes: `ClaimLobbyOwnershipUseCase`, `RelinquishOwnershipUseCase` (Task 4).
- Produces: the live claim endpoint; the two-path leave semantics.

- [ ] **Step 1: Failing route test** — `POST /v1/lobbies/{id}/ownership`: 401 for guest; 403 when not present / already owned; 409 when caller already owns an active game; 200 + `owner_user_id` set to caller when ownerless and under quota. Run under `withUserLock` (mirror the create path at `LobbiesRoute.kt:85`).
- [ ] **Step 2: Implement the claim route**, reading the capability the same way create does (`HOST_UNLIMITED_CAPABILITY in fresh.capabilities`, `LobbiesRoute.kt:90`) and passing `hostUnlimited` to the claim use case; whole thing inside `coordinator.withUserLock(whoAmI.userId)`.
- [ ] **Step 3: Failing WS test** — sending the `leaveLobby` frame relinquishes ownership (lobby becomes ownerless); a simulated disconnect+grace does NOT (owner_user_id intact). Implement the split at `:335` vs `:505`.
- [ ] **Step 4: Green + Spotless + Konsist arch test.** `./gradlew :game:api:spotlessApply :game:api:test`.
- [ ] **Step 5: Commit** `feat(game-api): claim-ownership route + explicit-leave relinquish split`.

---

### Task 8: Frontend — informational modal, claim UI, wire create sites

**Files:**
- Create: `frontend/src/ui/v2/multiplayer/OwnedGameModal.tsx` — the informational modal.
- Create: `frontend/src/ui/components/lobby/useCreateOrResume.ts` — shared hook wrapping create so the modal logic lives once.
- Modify create call sites: `frontend/src/ui/home/HomeScreen.tsx:215` (`handleCreateCoop`), `frontend/src/ui/v2/GrillesArchiveScreen.tsx:185`, `frontend/src/ui/routes/lobby.$lobbyId.tsx:152`.
- Modify: `frontend/src/application/game/LobbyClient.ts` (+ `HttpLobbyClient.ts`) — add `claimOwnership(lobbyId)`.
- Modify: `LiveCoopScreen.tsx` — show *"Reprendre la partie"* when the lobby is ownerless and the player is present.
- Test: `frontend/tests/...` (Vitest + MSW handlers in `frontend/src/infrastructure/mocks/handlers/game.ts`), plus `pnpm a11y`.

**Interfaces:**
- Consumes: create returns the lobby (with `state`); the claim endpoint (Task 2/7); `useCanSubscribe()` (`frontend/src/ui/components/billing/useCanSubscribe.ts`) for the subtle hint.
- Produces: `useCreateOrResume()` → `{ createOrResume(): Promise<void>, modal state }`.

- [ ] **Step 1: Failing Vitest** — when `createLobby` resolves with a lobby whose `state === 'IN_PROGRESS'` (⇒ you already own an active game), the hook shows `OwnedGameModal` instead of navigating; `WAITING` navigates silently. (Fresh creates are always `WAITING`; `IN_PROGRESS` in a create response can only be a resume — ADR-0098.)
- [ ] **Step 2: Build `useCreateOrResume`** + `OwnedGameModal` with: "Rejoindre ma partie" (navigate), "Démarrer une nouvelle partie" (only when the returned lobby's `players.length === 1` — sole occupant — calling relinquish-then-create), and the `useCanSubscribe()`-gated subtle hint + link.
- [ ] **Step 3: Rewire the three create sites** to call `useCreateOrResume().createOrResume()`; delete their bespoke navigate-on-success branches. Keep the existing anon → sign-in gate.
- [ ] **Step 4: Add `claimOwnership` to the client + the "Reprendre la partie" button** in `LiveCoopScreen` (shown when `lobby.ownerUserId == null` and the player is in `players`). MSW handler for the claim endpoint.
- [ ] **Step 5: Green.** `pnpm test`, `pnpm typecheck`, `pnpm a11y`. Boundaries lint (`eslint-plugin-boundaries`) clean.
- [ ] **Step 6: Commit** `feat(frontend-game): owned-game modal + claim ownership UI`.

---

## Self-Review

- **Spec coverage:** ADR-0098 §1 (quota→active/owner_user_id) = Tasks 4/5; §2 (relinquish/ownerless/claim) = Tasks 3/4/5/7/8; §3 (RGPD vacate) = Task 5; §4 (7d GC) = Task 6; §5 (gate-not-invariant, no DB constraint) = Task 4/5 (no migration added — enforced by omission, called out in Task 5 review); §6 (modal + claim UI) = Task 8; §7 (0039→0055 relabel) = folded into Tasks 6/others touching those comments. Threat model (claim/relinquish authz, TOCTOU) = Tasks 4 + 7. **No gaps.**
- **Schema-first:** Task 2 precedes producers (7) and consumers (8). ✓
- **Type consistency:** `findActiveByOwnerUser`, `findIdleOwnerless`, `relinquishOwner`, `claimOwner`, `isOwnerless`, `ClaimLobbyOwnershipUseCase`, `RelinquishOwnershipUseCase`, `UseCaseError.QuotaExceeded` — used identically across Tasks 3-8. ✓
- **Dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Tasks 3/4/5 could pipeline once the port signatures (Task 4 Step 1) are agreed. Do not start 7/8 before 2 merges.
