# ADR-0086: Attribute locked words to the player who found them (co-op coloring)

## Status

Proposed

## Context

In co-op (ADR-0018, ADR-0084), a correctly-completed word locks and renders in a
single "solved" colour, identical no matter who found it. The maintainer wants
each locked word tinted with **the colour of the player who validated it**, so a
shared grid visibly reflects who contributed what. `frontend/src/ui/lib/playerColor.ts`
already assigns every player a deterministic colour (used for their cursor,
avatar, and roster chip); locked words should reuse it.

The server today broadcasts `wordLocked` with only `positions` + `lockedAt` — it
does not say **who** locked the word, and the snapshot's `lockedPositions`
(`lobbyState.game.lockedPositions`, and the REST `GET /v1/lobbies/{id}`) carries
only `{row, column}`. So the client cannot attribute a lock to a player, nor can
a reconnecting / late-joining client colour already-locked words. This ADR adds
that ownership to the wire.

## Decision

### 1. Wire: carry the locking player on `wordLocked` and in the snapshot

- **`wordLocked` payload** gains a single top-level `lockedBy: SessionId` — the
  session whose write completed the word(s) in that event. All positions in one
  `wordLocked` frame share one `lockedBy` (they were locked by one write).
- **`lockedPositions`** items change from `GamePosition {row, column}` to a new
  **`LockedCell {row, column, lockedBy}`** — per-cell ownership, because the
  cumulative snapshot aggregates cells locked by different players. Applies in
  both `game/api/asyncapi.yaml` (`lobbyState`) and `game/api/openapi.yaml`
  (`GET /v1/lobbies/{id}`). Pre-release wire (0.1.0), so the shape change is
  acceptable.

### 2. First-writer-wins on crossing cells — no special-casing needed

A shared cell keeps the colour of the **first** word to lock it. This falls out
of two behaviours already true in the code (ADR-0084):

- The server emits `wordLocked` with only the **newly-locked** positions (a diff,
  not the union). A crossing word that locks later re-uses an already-locked cell
  but never re-emits it, so that cell is never re-attributed.
- `lockedPositions` is monotonically additive; an already-locked cell is not
  re-added, so its original `lockedBy` stands in the snapshot.

Worked example — `POMME` (across) and `PUIT` (down) share the `P` at (0,0):
player 1 completes `POMME` → `wordLocked([P,O,M,M,E], lockedBy=1)`; player 2 then
completes `PUIT` (the shared `P` is already locked, so they only filled `U,I,T`)
→ `wordLocked([U,I,T], lockedBy=2)`. `P` never appears in player 2's frame →
**`P` stays player 1's colour.** The frontend `reduceLobby` dedup keeps the first
occurrence per position as belt-and-suspenders for the snapshot path.

### 3. Frontend: soft fill tint from the finder's colour

A locked/solved cell's fill becomes
`color-mix(in srgb, var(--player-color) 32%, <current solved fill>)`, where
`--player-color` is `playerColor(lockedBy)` — the same hue as that player's
cursor. 32% matches the existing presence word-tint. Letters stay legible
(WCAG AA, ADR-0050); the solve-beat glow still plays on lock. Solo grids have no
`lockedBy` → no tint, unchanged.

`LiveCoopScreen` derives a `Map<posKey, SessionId>` from `lockedPositions` and
passes it to `PuzzleBoard`; `LetterSlot` sets `--player-color` and the tint on an
owned solved cell.

## Consequences

### Easier
- Co-op grids visibly show who solved what; consistent with existing per-player
  colours. Reconnects/late-joiners see correct colours (ownership is in the
  snapshot).

### Harder
- One wire field on `wordLocked` + a `LockedCell` shape for `lockedPositions`
  across asyncapi + openapi + the game `GameSession` model + the frontend types.

### Different
- `GameSession` now tracks lock ownership per position (was a plain position set).

## Acceptance / tests

- **Backend:** `wordLocked` carries `lockedBy` = the completing player; a crossing
  lock emits only the new cells with the new owner; the snapshot's shared cell
  keeps the **first** owner.
- **Frontend:** an owned solved cell renders `playerColor(lockedBy)`; the
  `POMME`/`PUIT` crossing `P` keeps player 1's colour after player 2 locks
  `PUIT`; solo/no-owner cells are untinted; contrast passes a11y.

## Rollout (schema-first)

1. This ADR (+ `INDEX.md`).
2. Schema: `wordLocked.lockedBy` + `LockedCell` for `lockedPositions` in
   `game/api/asyncapi.yaml` and `game/api/openapi.yaml` (+ regenerate frontend
   grid/game types for drift).
3. game-api: `GameSession` per-position owner; `LobbyEvent.WordLocked` + DTO +
   mapper carry `lockedBy`; snapshot serializes `LockedCell`.
4. frontend: types + `reduceLobby` + `LiveCoopScreen` + `PuzzleBoard`/`LetterSlot`
   tint.

## Relationships

- **Extends ADR-0084 / ADR-0018** (co-op locking). Reuses ADR-0050 a11y posture.
