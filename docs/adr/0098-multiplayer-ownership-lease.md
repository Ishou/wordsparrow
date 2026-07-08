# ADR-0098: Multiplayer lobby ownership as a claimable lease

## Status
Proposed

Extends ADR-0083 (multiplayer hosting entitlement) and amends ADR-0055
(multiplayer persistence: GC matrix + RGPD erasure cascade). Builds on
ADR-0018 (game context), ADR-0066 (cross-device "Mes parties", the sticky
`owner_user_id`), ADR-0029 (lobby ownership + join codes), and ADR-0079
(capability-based authorization). Relates to ADR-0080 (subscription offer).

## Context

ADR-0083 gated multiplayer **hosting**: guest = 0, free player = **1 "open
lobby"** (where "open" = a `WAITING` lobby), subscriber = unlimited. The quota
is enforced server-side in `CreateLobbyUseCase` via `findWaitingByOwnerUser`,
which counts **only `WAITING`** lobbies.

Three facts make that limit ineffective and its naive fix dangerous:

1. **The loophole.** A lobby's lifecycle is `WAITING → IN_PROGRESS → COMPLETED`.
   The quota counts only `WAITING`, so the moment a free player taps "Jouer"
   (`StartGameUseCase`, `LobbyUseCases.kt:281`, `WAITING → IN_PROGRESS`) the game
   stops counting and they may immediately create another. A free player can
   therefore accumulate unlimited concurrent in-progress games — the reported
   defect. The code faithfully implements ADR-0083's wording ("once that lobby's
   game starts … they may host again"); the *spec* was too weak, not the code.

2. **In-progress games never end on their own.** The only transition out of
   `IN_PROGRESS` is solving the puzzle (`UpdateCellUseCase`, `LobbyUseCases.kt:392`,
   `isSolved()`). The garbage collector **never evicts `IN_PROGRESS`** (ADR-0055
   GC matrix; `LobbyGarbageCollector.kt:34`). So naively counting `IN_PROGRESS`
   toward the quota would **permanently lock out** any free player who starts a
   puzzle and abandons it — a far worse outcome than the loophole.

3. **Ownership is never released except by account deletion.** `ownerSessionId`
   (non-null) and `ownerUserId` (nullable, but kept across the leave-grace for
   "Mes parties" visibility — ADR-0066) survive disconnect and even explicit
   leave: `LeaveLobbyUseCase` keeps both by design. The *only* path that changes
   ownership is RGPD erasure (ADR-0055 cascade rule 2: transfer to the
   earliest-joined remaining player). There is no user-facing "give up this
   game" and no way for a co-player to take over an abandoned game.

We want the free tier to mean **one active multiplayer game at a time**, with a
graceful, non-punitive way out — not a roach motel.

## Decision

Model lobby ownership as a **claimable lease**: you own a game until you finish
it or **explicitly** relinquish it; a relinquished game is **ownerless** and any
present player may **claim** it. The free-tier quota counts the games you
currently own.

### 1. Quota: 1 active game you own, counted by `owner_user_id`

- "Active" = non-terminal = `WAITING` **or** `IN_PROGRESS`.
- Counted by **`owner_user_id`**, not by seat. Ownership is sticky across
  disconnect/tab-close (ADR-0066 already maintains this) — **you stay the owner
  until you finish or explicitly leave**. Closing the tab is not leaving.
- Free player = **1** active owned game. `multiplayer:host-unlimited`
  (subscriber, ADR-0083) bypasses the check. Guest = 0 (unchanged, ADR-0083).
- Replaces `findWaitingByOwnerUser` with `findActiveByOwnerUser`
  (`state IN ('WAITING','IN_PROGRESS') AND owner_user_id = ?`).

This is deliberately **owner-based, not seat-based**: a seat-based count would
drop a disconnected owner out of quota, contradicting the rule above.

### 2. Ownership is a lease: relinquish, ownerless, claim

- **Relinquish (explicit only).** A deliberate "Quitter la partie" sets
  `owner_user_id = null` → the lobby is **ownerless** → it leaves the owner's
  quota and their "Mes parties". Only the current owner may relinquish.
- **Disconnect never relinquishes.** The `leaveLobby` WS frame is sent *only* by
  the explicit Quitter button; navigation/tab-close closes the socket without it
  (`GameClient.ts:93`). Server-side, the explicit-frame path relinquishes
  ownership; the disconnect **grace** path (`LobbyWebSocketRoute.kt:505`) drops
  presence/seat only and **keeps** `owner_user_id`. These two server behaviours,
  today merged in `LeaveLobbyUseCase`, are split.
- **Claim.** A player present in an **ownerless** (`owner_user_id IS NULL`)
  non-terminal lobby may claim it via a new `ClaimLobbyOwnershipUseCase`, which
  sets `owner_user_id` (and rebinds `ownerSessionId`) to the claimer. Claiming is
  **gated by the claimer's quota** (they must be under their active-game limit)
  and runs under the same per-user lock as create.
- **Ownerless games stay playable.** Co-players keep filling the grid and can
  complete the puzzle; only owner-gated actions (rotate code, kick) are inert
  until someone claims.
- **Persistence: neither op goes through the general save path.**
  `PostgresLobbyRepository.upsertLobby`'s `ON CONFLICT ... DO UPDATE` deliberately
  excludes `owner_user_id` ("write-once at create; a post-leave save must not
  null it", ADR-0066 amendment 2026-07-05), so a `relinquishOwner()`/`claimOwner()`
  domain transition saved via the standard `repo.mutate()` path would silently
  no-op the ownership write in Postgres. Relinquish and claim therefore need
  dedicated repository methods (`relinquishOwnership(lobbyId)`,
  `claimOwnership(lobbyId, userId)`) that issue a purpose-built
  `UPDATE lobbies SET owner_user_id = ...` — the same pattern already used by
  the RGPD erasure-cascade transfer/vacate write — bypassing `upsertLobby`
  entirely.

### 3. RGPD erasure cascade rule 2 → vacate (amends ADR-0055)

ADR-0055 rule 2 ("owner erases + others present → transfer ownership to
earliest-joined") is changed to **"vacate → ownerless"** (`owner_user_id = null`).
Rationale: a transfer conscripts an unconsenting user into ownership and can push
a free player over quota involuntarily; vacating avoids both and is more
privacy-clean (rules 1 and 3 are unchanged). The earliest-joined player may
*choose* to claim.

### 4. Garbage collection: 7-day ownerless sweep (amends ADR-0055)

The GC matrix gains a fourth rule: **ownerless** (`owner_user_id IS NULL`)
non-terminal lobbies idle beyond a TTL (default **7 days**, keyed on
`lastActivityAt`) are evicted. This reaps relinquished and RGPD-vacated games so
they do not accumulate. (`WAITING` 24h and `COMPLETED` 7d rules are unchanged;
`IN_PROGRESS` that is still *owned* remains never-evicted-by-idle.)

### 5. The quota is a create/claim-time gate, not an invariant

Enforcement happens **only** at create and claim, inside
`coordinator.withUserLock(userId)` (`pg_advisory_xact_lock`, the ADR-0083 TOCTOU
primitive). It is **never** a database uniqueness constraint on `owner_user_id`:
such a constraint would make an RGPD vacate/transfer or a legacy over-count fail
a compliance-critical or migration path. Being transiently at 2 (e.g. a
pre-existing double, or a race the lock did not cover) is tolerated — the user
simply cannot create or claim a new game until back to ≤ 1.

### 6. Frontend UX

- **Create while you already own an active game** → an **informational** modal,
  not a hard paywall:
  - *"Rejoindre ma partie"* (primary) → navigate into the existing game.
  - *"Démarrer une nouvelle partie"* → relinquish the old game, then create a new
    one. Offered **only when the caller is the sole occupant** of the old game
    (relinquishing a populated co-op game would strand others in an ownerless
    room — they can be offered a claim instead, but we do not make abandonment
    the one-tap default).
  - A **subtle, non-invasive** subscriber hint (*"Les abonnés peuvent créer
    plusieurs parties en même temps"* + a low-key link), since the limit genuinely
    is the paywall. Not a wall, not a nag.
  - Copy is generic ("Vous avez déjà une partie en cours"), because the existing
    game may be one you inherited/relinquished-into rather than one you just made.
- **In an ownerless game** → offer *"Reprendre la partie"* (claim), quota-gated.

### 7. Note: fix the ADR-0039 → ADR-0055 mislabel

Several `game/` comments cite "ADR-0039" for lobby ownership / GC / RGPD (e.g.
`Lobby.kt:112`, `LobbyGarbageCollector.kt:31`, `EraseSessionUseCase.kt:9`).
ADR-0039 is the grid generator; the correct reference is ADR-0055. Corrected
opportunistically in files this work already touches (not a standalone sweep).

## Threat model

**Assets:** the create endpoint (`POST /v1/lobbies`), the new claim action, the
per-user active-game quota, the `multiplayer:host-unlimited` capability, the
`owner_user_id` field.

**Actors:** a free player trying to exceed the 1-active-game quota; a player
trying to claim a game they are not in, or a still-owned game; concurrent
create/claim/relinquish from the same user; an attacker trying to strip another
user's ownership.

**Vectors and mitigations:**

- **Quota TOCTOU (create *and* claim):** both mutate under
  `withUserLock(userId)` and re-verify the count inside the lock — the same
  advisory-lock primitive ADR-0083 established for create. Claim additionally
  re-reads the lobby's `owner_user_id` under the lock so two claimers cannot both
  win.
- **Claim authorization:** only a session **present in the lobby** may claim, and
  only when `owner_user_id IS NULL`; both are re-checked under the lock. A claim
  on an owned lobby is rejected.
- **Relinquish authorization:** only the current owner (`owner_user_id == caller`)
  may relinquish; the disconnect grace path can never relinquish (separate server
  operation, no `owner_user_id` write).
- **RGPD vacate atomicity:** erasure never consults billing and is never blocked
  by quota; `owner_user_id` has **no** uniqueness constraint, so a vacate cannot
  fail on a paywall rule.
- **Capability parse gap:** unchanged from ADR-0083/0079 — an absent/malformed
  `capabilities` set deserializes to empty, so `multiplayer:host-unlimited` is
  never granted by a parse gap (deny-only).

## Consequences

**Easier / better:**
- The free tier means one coherent thing ("1 active game"), robust to the start
  transition that today's loophole exploits.
- No lockout: a stuck game has an explicit escape (relinquish) and a backstop
  (7-day ownerless GC).
- Co-op games survive owner departure — a co-player can claim instead of being
  stranded in an owner-frozen room.
- RGPD erasure gets simpler and more privacy-respecting (vacate, not conscript).
- The earlier "silent reclaim" hazard disappears: with owner-based counting,
  rejoining a game you still own adds nothing to your quota, and a game you
  relinquished no longer matches the `userId == ownerUserId` rejoin arm
  (`LobbyUseCases.kt:178`), so it is not auto-reclaimed.

**Harder / new:**
- A new lifecycle concept ("ownerless") and a claim action to build, test, and
  reason about. `owner_user_id` is already nullable (ADR-0066, migration `V3`),
  so no schema migration — but "null" now carries a second meaning
  (relinquished), which must be kept distinct from ADR-0066's "kept across
  leave-grace" (that path never nulls it).
- The explicit-quit vs disconnect server paths, merged today, must be split.
- New endpoint (claim) ⇒ schema-first PR (openapi + WS asyncapi + type regen).

**Migration:** none structural. The GC sweep and quota query are additive; the
erasure-cascade behaviour change is code-only (expand-and-contract not required —
no column changes).

**Registry:** `docs/adr/INDEX.md` gains ADR-0098 path bindings; ADR-0055 and
ADR-0083 get amendment notes; the ADR-0039→0055 comment mislabel is corrected in
touched files.

## Amendments

### 2026-07-08 — ownership on the wire + REST relinquish

The shipped implementation inferred ownerless-ness from live `ownershipChanged`
events only and relinquished via a WS frame; this broke reload-into-ownerless,
list/claim discovery, and made relinquish-then-create racy. The `Lobby` and
`LobbySummary` wire schemas gain `ownerless: boolean`, and a synchronous
`DELETE /v1/lobbies/{lobbyId}/ownership` is added (authorized by
`owner_user_id == caller`).
