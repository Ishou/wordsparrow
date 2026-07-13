# ADR-0113: Co-op rematch with a 10s server-driven auto-restart

## Status

Proposed

## Context

Multiplayer co-op grids (ADR-0018) end when every letter cell is
server-locked: the lobby moves to `COMPLETED`, `gameSolved` broadcasts, and
the frontend renders the `Résultats` win screen. (Reaching `COMPLETED` at all
was itself broken until the completion check was migrated from the
wire-stripped `LetterCell.answer` to `lockedPositions` — the immediate
predecessor fix.)

The win screen offers "Rejouer", but it calls `createOrResume()` — it mints a
**brand-new lobby owned by the tapping player** and navigates there. For a
group of friends who just finished a grid together this is the wrong shape:
each of N players tapping "Rejouer" lands in N separate empty rooms, and the
friends must re-share a link to regroup. There is no way to play another grid
*together* without leaving and rebuilding the room.

We want the opposite: when a co-op game finishes, the same room plays another
grid together, automatically, with a short pause to read the results. The
maintainer's shape: a **10-second countdown on the win screen that
auto-starts a fresh game** (same grid size, new puzzle), host-controllable.

Two facts about the existing `game/` context constrain the design:

- The lobby lifecycle is strictly one-way today —
  `WAITING → IN_PROGRESS → COMPLETED` — enforced per-use-case (each transition's
  use case guards on the required current state, e.g. `StartGameUseCase`
  requires `WAITING`); `Lobby`'s `init` only validates state/field consistency
  (`game == null` iff `WAITING`, `completedAt != null` iff `COMPLETED`), not
  transition legality. There is no use case today that transitions out of
  `COMPLETED`.
- Game control is **owner-gated**: only the owner starts a game
  (`StartGameUseCase`); joiners see "waiting for host" in the salon.

## Decision

### 1. Two new lifecycle edges out of `COMPLETED`

`Lobby`'s state machine gains:

- `COMPLETED → IN_PROGRESS` — the **rematch**: build a fresh `GameSession`
  (empty entries, empty locks, `startedAt = now`, `completedAt = null`) for the
  lobby's existing `gridConfig` and a newly fetched puzzle, exactly as
  `StartGameUseCase` does from `WAITING`. The rematch reuses that puzzle-fetch +
  session-build logic and the existing **`gameStarted`** broadcast, so clients
  already know how to render the new grid.
- `COMPLETED → WAITING` — **return to salon**: clear the `GameSession`
  (`game = null`), keep the players, owner, join `code`, and `gridConfig`, bump
  `lastActivityAt`. This backs the host's "Annuler" and is the path to changing
  the grid size before restarting (the salon already owns `setGridConfig` +
  `start`). It reuses the **`lobbyState`** snapshot broadcast (the same
  mechanism `rotateCode` uses to push an owner-driven change).

Both transitions are **owner-only** and valid **only from `COMPLETED`**,
mirroring the authorization and state guards of `startGame` / `rotateCode`.

### 2. Two new client→server commands; no new server→client events

`game/api/asyncapi.yaml` gains two owner-only command frames, each shaped like
`startGame` (a bare `type` discriminator — the lobby is addressed by the WS
path, and the retained `gridConfig` needs no argument):

- `rematch` → drives `COMPLETED → IN_PROGRESS`, server broadcasts `gameStarted`.
- `returnToSalon` → drives `COMPLETED → WAITING`, server broadcasts `lobbyState`.

Both reject with `not-owner` (403) when sent by a non-owner and `invalid-state`
when the lobby is not `COMPLETED`. No new **server→client** event type is
introduced: the two existing broadcasts (`gameStarted`, `lobbyState`) already
carry everything clients need, and the route/reducer already handle them.

### 3. 10-second auto-restart is server-driven, and "cancellable" by re-check

When the server broadcasts `gameSolved`, it schedules a delayed rematch on the
route's existing `backgroundScope`, mirroring `scheduleReconnectGrace`:

```
backgroundScope.launch {
    delay(REMATCH_AUTO_START_DELAY)   // 10s, a named constant
    // re-read the lobby under the per-lobby lock:
    // fire the rematch ONLY IF the lobby is still COMPLETED
    // AND game.completedAt still equals the value captured at schedule time.
}
```

Server-driven (not client-driven) because browsers throttle `setTimeout` in
backgrounded tabs to ~once per minute, so a host who glances at another tab
would silently never fire a client-side timer; a server timer is also perfectly
synchronized across all players and survives the host's disconnect.

Crucially — as with `scheduleReconnectGrace` — there is **no per-lobby job map
and no explicit `cancel()`**. Cancellation falls out of the fire-time re-check:

- "Rejouer maintenant" sends `rematch` now → lobby is `IN_PROGRESS` → the later
  timer observes a non-`COMPLETED` state and no-ops.
- "Annuler" sends `returnToSalon` → lobby is `WAITING` → the timer no-ops.
- The `completedAt` equality guard stops a **stale** timer from a prior game
  restarting a *newer* completed game (relevant only for very small grids
  re-solved inside 10s).

`RematchUseCase` itself guards on `state == COMPLETED` inside the `mutate`
lambda, so the manual tap, the timer, and any race are all idempotent under the
per-lobby lock (the last-write-wins guard pattern, ADR-0001 §"atomicity").

### 4. Win screen (frontend)

`ResultatsScreen` shows a **"Nouvelle partie dans N…"** countdown derived from
`completedAt + REMATCH_AUTO_START_DELAY` (both already on the snapshot), so
every client shows the same number with no extra messaging — the number is
cosmetic; the server timer is the authority. The **host** additionally sees
"Rejouer maintenant" (send `rematch`) and "Annuler" (send `returnToSalon`);
**all** players keep "Accueil". No routing changes are needed: `gameStarted`
already routes clients into the fresh grid and `lobbyState(WAITING)` already
routes them to `SalonScreen`.

### 5. Same grid size by default

The auto-restart and "Rejouer maintenant" reuse the lobby's current
`gridConfig`. Changing the size is a deliberate act: "Annuler" → salon →
pick a new size → Start. The win screen does not embed a size picker.

## Abuse / threat model

- **Actor.** The lobby owner (the only session that can send `rematch` /
  `returnToSalon`). Joiners cannot trigger either transition, so there is no
  cross-player griefing surface (a joiner who wants out taps Accueil).
- **Owner spam.** An owner rapidly toggling rematch/return only churns *their
  own* room; each rematch requires the prior game to be `COMPLETED`, and the
  per-lobby lock serializes transitions. No amplification, no effect on other
  lobbies.
- **Puzzle fetch.** A rematch is one puzzle fetch from grid, identical in cost
  to a normal `startGame`; the 10s floor between auto-restarts bounds the rate.
- **Retention (ADR-0055).** A lobby back in `WAITING` or restarted to
  `IN_PROGRESS` is a live game under the normal idle GC; no new retention class.

## Consequences

### Easier

- Friends play grid after grid together in one room, hands-free — the core
  co-op loop finally closes.
- No active-game quota dance (ADR-0083 / ADR-0098 `OwnedGameModal`): a rematch
  is the *same* lobby, not a newly created one.
- Friends who closed their tab can rejoin via the same `code` during the
  `WAITING` phase.

### Harder

- The lobby state machine is no longer a strict one-way DAG; `COMPLETED` is no
  longer terminal. `Lobby`'s `init` and any exhaustiveness over states must
  admit the two new edges.
- The `game/` context now runs a second class of background-scheduled work
  (rematch timer) alongside the reconnect-grace timer. Both are re-check-guarded
  rather than job-tracked, keeping the model uniform.

### Different

- The win screen's "Rejouer" changes meaning from "new room I own" to "another
  grid in *this* room"; the new-room replay is dropped from the win screen
  (Accueil + home create remains the path to a fresh solo/owned game).

## Rollout (schema-first)

Prerequisite: the completion-from-locks fix (makes `COMPLETED` reachable in
production) must be deployed first.

1. **This ADR** — decision + abuse model. Update `docs/adr/INDEX.md`.
2. **Schema-only:** `game/api/asyncapi.yaml` adds the `rematch` and
   `returnToSalon` command frames + their `type` discriminators, documented as
   owner-only / `COMPLETED`-only. Frontend regenerates types.
3. **Backend:** the two `Lobby` edges; `RematchUseCase` +
   `ReturnToSalonUseCase` (sharing `StartGameUseCase`'s puzzle-fetch/session
   build); route wiring for the two commands; `scheduleRematch` on the
   `gameSolved` broadcast path; analytics event(s). Domain + use-case tests
   (including the stale-timer `completedAt` guard and the owner/state
   rejections).
4. **Frontend:** `ResultatsScreen` countdown + host "Rejouer maintenant" /
   "Annuler"; wire the two commands through the lobby WS client/actions.

Each step is well under the ADR-0001 400-line cap.

## Relationships

- **ADR-0018** — the co-op context and the `WAITING → IN_PROGRESS → COMPLETED`
  lifecycle this extends.
- **ADR-0055** — lobby persistence/retention; the new edges add no retention
  class.
- **ADR-0083 / ADR-0098** — active-game entitlement + ownership lease; a
  same-room rematch sidesteps both (no new lobby, no `OwnedGameModal`).
- **ADR-0084** — the lock-based completion signal that makes `COMPLETED`
  reachable and drives the win screen.
