# Multiplayer account-scoped player identity — Implementation Plan

> **For agentic workers:** This repo executes multi-PR work via the `dispatch`
> skill in schema-first **waves** — each wave is ONE PR, ≤400 lines of
> non-generated diff (ADR-0001 §4), reviewed (§6a) and MERGED before the next
> is dispatched. Waves are ordered by hard dependency; do NOT parallelize a
> wave against an unmerged predecessor. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An authenticated user in a multiplayer lobby is one player with one
shared score on every device, instead of appearing twice with two scores.

**Architecture:** Introduce a stable `PlayerId` (= `userId` when authed, else
`sessionId`), derived at the WebSocket edge from the server-verified cookie
identity. Re-key the live roster (`Lobby.players`) and lock/score attribution
(`lockedPositions[].lockedBy`) on it. Ownership, presence, and the per-device
cell-sync transport stay `sessionId`-scoped.

**Tech Stack:** Kotlin 2.3 + Ktor (game context, hexagonal domain/application/
infrastructure/api), Postgres via CNPG + Flyway, kotlinx-serialization wire
frames; React 19 + TS + Panda + Vitest frontend; AsyncAPI/OpenAPI contract with
generated TS types.

## Global Constraints

- **Schema-first (ADR-0001 §3 / ADR-0003):** the `asyncapi.yaml` change (Wave 2)
  merges BEFORE the Kotlin producer and TS consumer changes. Never hand-edit
  `frontend/src/infrastructure/api/game/types.ts` — regenerate via `pnpm api:check`.
- **≤400 lines non-generated diff per PR;** one workstream per PR. If a wave
  exceeds the cap, split it and note the split.
- **Hexagonal boundaries (Konsist-enforced):** `domain/` imports nothing;
  `application/` defines ports; no vendor SDK in `domain`/`application`. No
  cross-context imports.
- **TDD for domain logic:** failing test first; domain targets near-100%
  mutation coverage. Property-based tests for serialization/validation.
- **Auth-boundary rule:** the authed `playerId` derives ONLY from the
  connect-time server-verified `userId` (identity-api cookie), NEVER from a
  client frame. The threat model is in the spec — cite it in the Wave 1 ADR
  and the Wave 3/4 PR bodies.
- **Migrations are expand-and-contract, backward-compatible.**
- **French copy uses tutoiement;** no `println`/`console.log`; comments are
  one-line non-obvious-why only.
- **Commit sign-off (`-s`, DCO);** conventional commits with bounded-context
  scope: `feat(game-domain)`, `feat(game-api)`, `feat(frontend-game)`,
  `docs(adr)`, `chore(api-game)`.
- **Spec:** `docs/superpowers/specs/2026-07-23-multiplayer-account-player-identity-design.md`.

---

## Wave 1 — ADR + spec (governance PR)

**PR:** `docs(adr): ADR-0066 amendment (e) — account-scoped live player identity`
**Branch:** `docs/adr-0066-account-player-identity`
**Gate:** `readme-diagrams-drift` N/A; `registry-coherence` (ADR ↔ INDEX.md);
§6a LGTM. No code, no schema.

### Task 1.1: Append amendment (e) to ADR-0066

**Files:**
- Modify: `docs/adr/0066-cross-device-my-lobbies.md` (append a new
  `## Amendment 2026-07-23 (e)` section)
- Modify: `docs/adr/INDEX.md` (add path→ADR rows for the game live-identity
  files if not already mapped: `game/domain/.../Identifiers.kt`,
  `game/application/.../usecases/LobbyUseCases.kt`, `game/api/.../routes/LobbyWebSocketRoute.kt`)
- Add: the spec doc is bundled into this PR
  (`docs/superpowers/specs/2026-07-23-...-design.md`, already committed)

- [ ] **Step 1: Write amendment (e).** Content (verbatim structure — mirror the
  existing (a)–(d) amendment format in the same file):
  - `### Problem the original decision missed` — amendment (b) MOVES the seat by
    `sessionId` but never broadcasts a `PlayerLeft` for the displaced seat, and
    identity + score remain `sessionId`-keyed (ADR-0018 §6, ADR-0102). Net bug:
    one account joining from two devices appears twice with two scores. Cite the
    root-cause file:lines from the spec.
  - `### Decision` — for authed players the live game model is account-scoped:
    a stable `PlayerId` (= `userId` when authed, else `sessionId`) keys
    `Lobby.players` and `lockedPositions[].lockedBy`. Join is an idempotent
    upsert on `playerId` (deletes the seat-move). Reconnect-grace removes a
    player only when no live socket remains for its `playerId`. Ownership,
    presence, and the cell-sync transport stay `sessionId`-scoped.
  - `### Threat model` — paste the STRIDE pass from spec §10.
  - `### Supersession` — supersedes ADR-0018 §6 for authed *live* identity and
    score attribution ONLY; §6 stands for anon and for the per-device transport.
  - `### References` — ADR-0018 §6/§7/§9, ADR-0086, ADR-0102, ADR-0066(a)–(d).

- [ ] **Step 2: Update INDEX.md** so the touched game paths map to ADR-0066.
  Run `scripts/adr-context.sh game/application/.../usecases/LobbyUseCases.kt`
  and confirm ADR-0066 now resolves.

- [ ] **Step 3: Commit**
```bash
git add docs/adr/0066-cross-device-my-lobbies.md docs/adr/INDEX.md \
  docs/superpowers/specs/2026-07-23-multiplayer-account-player-identity-design.md
git commit -s -m "docs(adr): ADR-0066 amendment (e) — account-scoped live player identity"
```

---

## Wave 2 — Schema-only wire change

**PR:** `chore(api-game): playerId on Player/roster frames + lockedBy`
**Branch:** `chore/game-asyncapi-player-id`
**Gate:** `openapi-lint`, `openapi-typescript-drift`. Merges after Wave 1.
**Depends on:** Wave 1 merged.

### Task 2.1: Add `PlayerId` schema and thread it through the roster + lock frames

**Files:**
- Modify: `game/api/asyncapi.yaml`
- Modify (generated, via tool): `frontend/src/infrastructure/api/game/types.ts`
- Check: `game/api/openapi.yaml` — grep for any REST exposure of `players`/
  `lockedPositions`; if present, mirror the field there.

**Interfaces produced (the wire contract every later wave consumes):**
- `PlayerId` schema: `{ type: string }` (UUID string; carries either a `userId`
  or, for anon, a `sessionId`).
- `Player` gains required `playerId: PlayerId` (keeps `sessionId`, `pseudonym`,
  `joinedAt`).
- `PlayerJoined`, `PlayerLeft`, `PlayerRenamed` payloads gain required
  `playerId: PlayerId`.
- `LockedCellDto.lockedBy`: `SessionId` → `PlayerId`. Same for the
  `wordLocked` payload and `lobbyState.game.lockedPositions[].lockedBy`.

- [ ] **Step 1: Edit `asyncapi.yaml`.** Under `components.schemas` add:
```yaml
    PlayerId:
      type: string
      description: >
        Stable per-account player identity in the live game. Equals the
        authenticated `userId`; for an anonymous player it equals their
        per-device `sessionId`. Keys the roster and lock/score attribution
        (ADR-0066 amendment (e)). Distinct from the transport `sessionId`,
        which stays per-device.
      example: 0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b
```
  Then add `playerId: { $ref: '#/components/schemas/PlayerId' }` to `Player`
  (required), `PlayerJoinedPayload`, `PlayerLeftPayload`, `PlayerRenamedPayload`
  (required in each), and change every `lockedBy` from
  `{ $ref: '#/components/schemas/SessionId' }` to
  `{ $ref: '#/components/schemas/PlayerId' }`. Update the inline `examples` so
  each `playerId` is present.

- [ ] **Step 2: Lint.** Run: `pnpm --dir frontend api:check` (or the repo's
  `openapi-lint` invocation). Expected: PASS after regeneration; the drift gate
  is satisfied because the regenerated `types.ts` matches.

- [ ] **Step 3: Confirm generated types changed.** `git diff --stat
  frontend/src/infrastructure/api/game/types.ts` shows `playerId` added and
  `lockedBy` retyped. Do not hand-edit.

- [ ] **Step 4: Commit**
```bash
git add game/api/asyncapi.yaml frontend/src/infrastructure/api/game/types.ts game/api/openapi.yaml
git commit -s -m "chore(api-game): add PlayerId to roster frames and lockedBy"
```

---

## Wave 3 — Game domain + application + migration

**PR:** `feat(game-domain): account-scoped player identity + score attribution`
**Branch:** `feat/game-player-id-domain`
**Gate:** `ci` (Gradle build, tests, Spotless, Konsist), Postgres Testcontainers.
Merges after Wave 2. **If this exceeds 400 lines, split the migration + repo
change into a sibling `feat(game-infrastructure)` PR.**
**Depends on:** Wave 2 merged (the `lockedBy: PlayerId` contract is fixed).

### Task 3.1: `PlayerId` value type

**Files:**
- Modify: `game/domain/src/main/kotlin/com/bliss/game/domain/.../Identifiers.kt`
- Test: `game/domain/src/test/kotlin/.../PlayerIdTest.kt`

**Interfaces produced:**
- `@JvmInline value class PlayerId(val value: String)` — same UUID regex guard
  as `UserId`.
- `fun playerIdOf(userId: UserId?, sessionId: SessionId): PlayerId` (domain
  free function or `PlayerId.of(...)`): `PlayerId(userId?.value ?: sessionId.value)`.

- [ ] **Step 1: Failing test** (`PlayerIdTest.kt`):
```kotlin
class PlayerIdTest {
    @Test fun `derives from userId when present`() {
        val uid = UserId("11111111-1111-4111-8111-111111111111")
        val sid = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
        assertThat(PlayerId.of(uid, sid).value).isEqualTo(uid.value)
    }
    @Test fun `falls back to sessionId when anonymous`() {
        val sid = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
        assertThat(PlayerId.of(null, sid).value).isEqualTo(sid.value)
    }
    @Test fun `rejects a non-uuid value`() {
        assertThatThrownBy { PlayerId("nope") }.isInstanceOf(IllegalArgumentException::class.java)
    }
}
```
- [ ] **Step 2: Run — expect FAIL** (`PlayerId` unresolved).
  `./gradlew :game:domain:test --tests '*PlayerIdTest' --rerun-tasks`
- [ ] **Step 3: Implement** `PlayerId` + `PlayerId.of` in `Identifiers.kt`
  (mirror `UserId`'s regex init; `of` picks `userId?.value ?: sessionId.value`).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(game-domain): add PlayerId identity`.

### Task 3.2: Re-key `Lobby.players` and `lockedPositions` on `PlayerId`

**Files:**
- Modify: `game/domain/src/main/kotlin/.../Lobby.kt` (`Player`, `players` map,
  `lockedPositions`, `hasJoined`, helpers)
- Test: `game/domain/src/test/kotlin/.../LobbyTest.kt`

**Interfaces produced:**
- `data class Player(val playerId: PlayerId, val pseudonym: Pseudonym, val joinedAt: Instant, val userId: UserId? = null)`
  — `playerId` replaces `sessionId` as identity.
- `Lobby.players: Map<PlayerId, Player>`.
- `GameSession.lockedPositions: Map<Position, PlayerId>`.
- `fun Lobby.hasJoined(playerId: PlayerId): Boolean`.

- [ ] **Step 1: Failing test** — a lobby seats one entry per `playerId`; two
  distinct sessionIds sharing a userId collapse to one:
```kotlin
@Test fun `two sessions of one account are one roster entry`() {
    val uid = UserId("11111111-1111-4111-8111-111111111111")
    val pid = PlayerId.of(uid, SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b"))
    val lobby = aLobby().seat(Player(pid, Pseudonym.of("Alex"), t0, uid))
    val again = lobby.seat(Player(pid, Pseudonym.of("Alex"), t1, uid))
    assertThat(again.players.keys).containsExactly(pid)
}
```
  (Use whatever seat/copy helper the aggregate exposes; if seating is only via
  the use case, assert the invariant through `JoinLobbyUseCase` in Task 3.3
  instead and keep this test at the map-shape level.)
- [ ] **Step 2: Run — expect FAIL** (type mismatch: `players` still keyed by
  `SessionId`).
- [ ] **Step 3: Implement** the re-key across `Lobby.kt`. Replace the `Player`
  identity field, the `players` map key type, `lockedPositions` value type, and
  every `hasJoined`/lookup to take a `PlayerId`. Fix compile fallout in the file.
- [ ] **Step 4: Run — expect PASS** (this file's tests).
- [ ] **Step 5: Commit** `feat(game-domain): re-key roster and locks on PlayerId`.

### Task 3.3: Idempotent authed join (delete the seat-move)

**Files:**
- Modify: `game/application/src/main/kotlin/.../usecases/LobbyUseCases.kt`
  (`JoinLobbyUseCase`) — signature already takes `userId: UserId?`
- Test: `game/application/src/test/kotlin/.../JoinLobbyUseCaseTest.kt`

**Interfaces consumed:** `PlayerId.of(userId, sessionId)` (Task 3.1),
`Lobby.players: Map<PlayerId, Player>` (Task 3.2).
**Interfaces produced:** `JoinLobbyUseCase.invoke(...)` unchanged signature;
new behaviour — seats/upserts by `PlayerId`; a second device of the same account
is an idempotent no-op emitting NO duplicate `PlayerJoined`.

- [ ] **Step 1: Failing test** — same userId, two sessionIds → one seat, and the
  second join does not re-emit a join event that would duplicate the row:
```kotlin
@Test fun `second device of same account does not create a second seat`() = runTest {
    val uid = UserId("11111111-1111-4111-8111-111111111111")
    joinLobby(lobbyId, sidA, pseudo, code, userId = uid)
    val out = joinLobby(lobbyId, sidB, pseudo, code = null, userId = uid)
    val lobby = (out as UseCaseOutcome.Success).result
    assertThat(lobby.players.keys).containsExactly(PlayerId.of(uid, sidA))
}
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** Compute `val pid = PlayerId.of(userId, sessionId)`.
  Replace the `when` arms: reconnect/idempotent when `lobby.hasJoined(pid)`;
  owner arms keyed as today on `ownerSessionId`/`ownerUserId` (unchanged);
  else upsert `players + (pid to Player(pid, verifiedPseudonym ?: pseudonym,
  now, userId))`. **Delete** the `withoutStaleSeat` filter — collapsing is now
  structural via the `pid` key. `lockedPositions` writes in `UpdateCellUseCase`
  use `pid` (thread the caller's `PlayerId` in — see Task 4.1 for the edge that
  supplies it).
- [ ] **Step 4: Run — expect PASS**; run the whole use-case suite to catch
  regressions in owner/anon arms.
- [ ] **Step 5: Commit** `feat(game-application): idempotent authed join by PlayerId`.

### Task 3.4: `UpdateCellUseCase` attributes locks to `PlayerId`

**Files:**
- Modify: `game/application/.../usecases/LobbyUseCases.kt` (`UpdateCellUseCase`,
  currently `associateWith { sessionId }` ~line 664)
- Test: `.../UpdateCellUseCaseTest.kt`

**Interfaces produced:** `UpdateCellUseCase.invoke(lobbyId, playerId: PlayerId,
position, letter)` — the attribution key becomes `PlayerId`. (The API edge maps
its socket `sessionId`+verified `userId` to a `PlayerId` before calling.)

- [ ] **Step 1: Failing test** — a completed word locks its cells under the
  caller's `playerId`; two devices of one account both attribute to the same key.
- [ ] **Step 2: Run — expect FAIL** (signature/type).
- [ ] **Step 3: Implement** — change the param and `associateWith { playerId }`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(game-application): attribute locks to PlayerId`.

### Task 3.5: Mid-game sign-in rebind re-keys roster + locks

**Files:**
- Modify: the rebind path (`rebindAnonSeats` port impl + use case, per
  `game/application/.../ports/Ports.kt:245-251` and `LobbyRebindRoute`)
- Test: rebind use-case test

**Behaviour:** when an anon seat (`playerId == sessionId`) is stamped with a
`userId`, re-key that roster entry to `PlayerId.of(userId, sessionId)` and
re-attribute that session's `lockedPositions` entries to the new `playerId`.

- [ ] **Step 1: Failing test** — anon player with N locked cells signs in →
  roster entry re-keyed to `userId`, all N locks now under the account `playerId`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the re-key + lock re-attribution in the rebind path.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(game-application): rebind re-keys roster and locks`.

### Task 3.6: Persistence + migration

**Files:**
- Modify: `game/infrastructure/.../persistence/PostgresLobbyRepository.kt`
  (`lobby_players` write/read, `game_payload` JSONB `lockedBy` mapping)
- Add: `game/infrastructure/src/main/resources/db/migration/V4__lobby_players_player_id.sql`
- Test: `PostgresLobbyRepositoryTest.kt` (Testcontainers)

**Decision this task locks (spec §8):** make `lobby_players.session_id`
NULLABLE and treat `coalesce(user_id, session_id)` as the row identity, OR keep
a primary `session_id` per authed row — pick NULLABLE `session_id` + identity =
`coalesce(user_id, session_id)` (cleaner: an authed row need not name any one
device). Because `lobby_players` is DELETE+INSERT full-rewritten on every save,
no row-dedup backfill is needed. For `game_payload` `lockedBy`: forward-
compatible read (a legacy `sessionId`-keyed value is read as a `PlayerId`
string; anon values are already correct; authed in-flight locks self-heal on the
next lock) — no JSONB backfill.

- [ ] **Step 1: Migration** `V4__lobby_players_player_id.sql`:
```sql
-- Authed seats identify by user_id; a row need not name a single device.
ALTER TABLE lobby_players ALTER COLUMN session_id DROP NOT NULL;
```
  (Only if `session_id` is currently `NOT NULL` / part of the PK — inspect V1.
  If it is in the PK, add a surrogate identity column instead; pin from V1.)
- [ ] **Step 2: Failing Testcontainers test** — save a lobby whose roster has one
  authed `Player` (no per-device session), reload, assert one row round-trips and
  the `playerId` survives.
- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement** the repo read/write mapping to persist/reconstruct
  `Player.playerId` and the JSONB `lockedBy` as `PlayerId`.
- [ ] **Step 5: Run — expect PASS**; run `:game:infrastructure:test`.
- [ ] **Step 6: Commit** `feat(game-infrastructure): persist PlayerId roster and locks`.

---

## Wave 4 — Game API (wire mapping + grace + broadcast)

**PR:** `feat(game-api): broadcast playerId, playerLeft on last session`
**Branch:** `feat/game-api-player-id`
**Gate:** `ci` + the two-connection integration test below. Merges after Wave 3.
**Depends on:** Wave 3 merged.

### Task 4.1: Derive `PlayerId` at the socket edge and thread it into use cases

**Files:**
- Modify: `game/api/.../routes/LobbyWebSocketRoute.kt` (`dispatchJoin`,
  `CellUpdate` handler)
- Modify: `game/api/.../dto/WebSocketFrameDto.kt` +
  `game/api/.../mapper/LobbyResponseMapper.kt` (emit `playerId` on `Player`,
  `PlayerJoined`, `PlayerLeft`, `PlayerRenamed`, `lockedBy`)

**Interfaces consumed:** wire fields from Wave 2; `PlayerId.of`,
`JoinLobbyUseCase`, `UpdateCellUseCase(playerId=…)` from Wave 3.

- [ ] **Step 1: Failing route/mapper test** — a `PlayerJoined` frame carries
  `playerId` = the socket's verified `userId`; a `lockedBy` in a `wordLocked`
  frame carries the `playerId`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — at connect/join compute `val pid =
  PlayerId.of(verifiedUserId, sid)`; pass `pid` to `updateCell`; map DTOs to
  include `playerId`. Kick handler targets `playerId`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(game-api): thread PlayerId through the socket edge`.

### Task 4.2: Reconnect-grace removes on last session per `playerId`

**Files:**
- Modify: `game/api/.../routes/LobbyWebSocketRoute.kt` (the `finally` grace
  block) + `game/api/.../SessionManager.kt` (extend the "another live socket?"
  check from `sessionId` to `playerId`/`userId`)

**Interfaces consumed:** `SessionManager.userIdToSessions`, `bindUserId`,
`unregister` (already present).
**Interfaces produced:** grace schedules a `playerLeft(playerId)` only when no
live socket remains for that `playerId` (for authed: no other device connected).

- [ ] **Step 1: Failing test** — two sockets, same `userId`; close one; assert NO
  `playerLeft` is broadcast while the other stays connected. Close the second;
  assert `playerLeft(playerId)` fires after grace.
- [ ] **Step 2: Run — expect FAIL** (today it schedules by `sessionId`).
- [ ] **Step 3: Implement** — in the grace path, resolve the closing socket's
  `playerId`; skip removal if `SessionManager` still has any live socket for that
  `playerId` (reuse the `userIdToSessions` index for authed; for anon fall back
  to the existing per-`sessionId` multi-tab check).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(game-api): grace removes on last session per PlayerId`.

### Task 4.3: Two-connection integration test (verification §1–4)

**Files:**
- Test: `game/api/src/test/kotlin/.../TwoDeviceAccountIdentityTest.kt`

- [ ] **Step 1: Write the test** — spin the WS route with a stub `CookieVerifier`
  returning the SAME `userId` for two cookies. Open two sockets, both `joinLobby`
  with different `sessionId`s. Assert: (1) roster has ONE entry for the account;
  (2) a lock from socket A and a lock from socket B both tally under one
  `playerId`; (3) a `cellUpdated` from A is delivered to B (transport intact);
  (4) closing A emits no `playerLeft` while B is connected.
- [ ] **Step 2: Run — expect PASS** (all Wave 3–4 behaviour now in place).
- [ ] **Step 3: Commit** `test(game-api): two-device account identity e2e`.

---

## Wave 5 — Frontend (roster + score + board tint by PlayerId)

**PR:** `feat(frontend-game): group roster and score by playerId`
**Branch:** `feat/frontend-game-player-id`
**Gate:** `frontend-build`, `pnpm test`, `pnpm typecheck`, `pnpm a11y`. Merges
after Waves 2+4.
**Depends on:** Wave 2 merged (types) and Wave 4 merged (server emits `playerId`).

### Task 5.1: `PlayerId` brand + score tally by `playerId`

**Files:**
- Modify: `frontend/src/domain/game/types.ts` (add `PlayerId` brand)
- Modify: `frontend/src/application/game/playerScores.ts`
  (`tallyValidatedLetters` groups by `PlayerId`)
- Test: `frontend/tests/.../playerScores.test.ts`

**Interfaces produced:**
- `export type PlayerId = string & { readonly __brand: 'PlayerId' };`
- `tallyValidatedLetters(lockedPositions: ReadonlyArray<{ readonly lockedBy: PlayerId }>): ReadonlyMap<PlayerId, number>`

- [ ] **Step 1: Update the failing test** — `lockedBy` is now a `PlayerId`; two
  cells with the same account `playerId` (from different devices) tally to 2.
- [ ] **Step 2: Run — expect FAIL** (type).
- [ ] **Step 3: Implement** the brand + retype the helper.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend-game): tally score by playerId`.

### Task 5.2: Roster reducer + "you" + board tint key on `playerId`

**Files:**
- Modify: `frontend/src/ui/components/lobby/lobbyView.ts` (dedupe/append/remove
  by `playerId`), `PlayerList.tsx` / `WaitingRoom.tsx` (`isYou` by account),
  `frontend/src/ui/v2/multiplayer/PlayerStrip.tsx` + `ResultatsScreen.tsx`
  (score map keyed by `playerId`), the board tint-by-finder lookup (ADR-0086)
- Modify: `frontend/src/ui/components/lobby/useLobbyConnection.ts` (own-identity
  = `auth.whoami.userId ?? sessionId`)
- Test: the corresponding component/reducer tests + MSW handlers
  (`frontend/src/infrastructure/mocks/handlers/game.ts`)

**Interfaces consumed:** `playerId` on wire `Player`/frames (Wave 2).
**Guardrail (spec §6):** do NOT add any self-echo suppression keyed on
`playerId` in the `cellUpdated` path — `applyRemoteCellUpdate` stays as-is.

- [ ] **Step 1: Failing test** — reducer: `playerJoined` dedupes by `playerId`;
  `playerLeft` removes by `playerId`; `PlayerList` marks the row whose
  `playerId` equals the local account as "you"; a cellUpdated from another device
  of the same account still applies (transport untouched).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — swap `sessionId` → `playerId` in the roster
  identity comparisons (`lobbyView.ts:77,92,101`, `PlayerList.tsx:166,174,225`,
  `WaitingRoom.tsx:149`); compute `currentPlayerId = auth.whoami?.userId ??
  sessionId`; key score maps and the board tint palette lookup on `playerId`.
  Leave `applyRemoteCellUpdate` and all presence/cursor code on `sessionId`.
- [ ] **Step 4: Run — expect PASS**; `pnpm typecheck`, `pnpm test`, `pnpm a11y`.
- [ ] **Step 5: Commit** `feat(frontend-game): roster, score, tint by playerId`.

### Task 5.3: Manual two-device verification (DoD)

- [ ] Run the app (`make dev`), sign in the SAME account on two browser
  profiles, join one lobby from both. Confirm: one roster row; typing on one
  device lands on the other live; locked letters accrue to a single shared
  score; closing one device does not drop the account. Screenshot both. (Project
  rule: a green unit test is not a verified fix for an identity/routing bug.)

---

## Self-review notes

- **Spec coverage:** §1 PlayerId→3.1/4.1/5.1; §2 roster→3.2/3.3/5.2; §3 score→
  3.4/5.1/5.2; §4 grace→4.2; §5 ownership/presence unchanged (asserted, not
  coded); §6 transport invariant→guardrails in 5.2 + test 4.3(3); §7 wire→Wave 2;
  §8 persistence→3.6; §9 rebind→3.5; §10 threat model→1.1. Verification §→4.3+5.3.
- **Predecessor-gated specifics (not placeholders):** the exact wire field
  presence is fixed in Wave 2 before any consumer; the `lobby_players.session_id`
  nullability is decided and justified in Task 3.6 against V1's actual DDL
  (inspect before writing V4).
- **Type consistency:** `PlayerId` (Kotlin `@JvmInline value class` / TS brand),
  `PlayerId.of(userId, sessionId)`, `players: Map<PlayerId, Player>`,
  `lockedPositions: Map<Position, PlayerId>`, `lockedBy: PlayerId`,
  `tallyValidatedLetters(... lockedBy: PlayerId ...)` used consistently across
  waves.
