import type { GameEvent } from '@/application/game';
import type {
  GameSession,
  Lobby,
  LobbyLifecycleState,
  LockedCell,
} from '@/domain/game';

// Internal lobby state — the route-local snapshot the reducer folds
// events into. Wraps the domain `Lobby` and adds two integration-only
// fields (`durationMs`, `modalDismissed`) that no other layer needs:
// `durationMs` arrives in `gameSolved` and is consumed by `Timer` /
// `EndGameModal` only; `modalDismissed` is local UI state for the
// close-without-leaving-the-page flow. Keeping them off the domain
// `Lobby` keeps `domain/game/types.ts` aligned with the wire schema.
export interface LobbyView {
  readonly lobby: Lobby;
  readonly durationMs: number | null;
  readonly modalDismissed: boolean;
}

// Fallback for the reload-after-completion path: derive `durationMs` from `completedAt − startedAt` when no live `gameSolved` reaches this client; live event still wins (returns `current` when set).
export function deriveDurationMs(
  current: number | null,
  state: LobbyLifecycleState,
  game: GameSession | null,
): number | null {
  if (current !== null) return current;
  if (state !== 'COMPLETED' || !game || game.completedAt == null) return current;
  const startedMs = Date.parse(game.startedAt);
  const completedMs = Date.parse(game.completedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) return current;
  const diff = completedMs - startedMs;
  return diff >= 0 ? diff : 0;
}

// Folds a server→client `GameEvent` into the locally-cached `LobbyView`.
// Membership events update `lobby.players`; `gameStarted` flips the
// state to `IN_PROGRESS` and embeds the `GameSession`; `gameSolved`
// flips to `COMPLETED` and stashes the authoritative server-emitted
// `durationMs` so `Timer` can freeze and `EndGameModal` can display it.
// `cellUpdated` is consumed directly by `Grid`'s
// `subscribeToRemoteCellUpdates` — the reducer leaves it untouched so
// no React render is triggered per keystroke (ADR-0002 §4).
export function reduceLobby(current: LobbyView, event: GameEvent): LobbyView {
  switch (event.type) {
    case 'lobbyState': {
      // `code` is first-class on the snapshot. `durationMs` is filled from the snapshot only when no live `gameSolved` has populated it yet (reload-into-COMPLETED path); see `deriveDurationMs`.
      const derivedDurationMs = deriveDurationMs(current.durationMs, event.state, event.game);
      return {
        ...current,
        lobby: {
          players: event.players, ownerSessionId: event.ownerSessionId,
          state: event.state, gridConfig: event.gridConfig, game: event.game,
          code: event.code,
        },
        durationMs: derivedDurationMs,
      };
    }
    case 'playerJoined':
      if (current.lobby.players.some((p) => p.sessionId === event.sessionId)) return current;
      return {
        ...current,
        lobby: {
          ...current.lobby,
          players: [...current.lobby.players, {
            sessionId: event.sessionId, pseudonym: event.pseudonym, joinedAt: event.joinedAt,
          }],
        },
      };
    case 'playerLeft':
      return {
        ...current,
        lobby: {
          ...current.lobby,
          players: current.lobby.players.filter((p) => p.sessionId !== event.sessionId),
        },
      };
    case 'playerRenamed':
      return {
        ...current,
        lobby: {
          ...current.lobby,
          players: current.lobby.players.map((p) =>
            p.sessionId === event.sessionId ? { ...p, pseudonym: event.newPseudonym } : p,
          ),
        },
      };
    case 'gameStarted':
      return {
        ...current,
        lobby: {
          ...current.lobby,
          state: 'IN_PROGRESS',
          // Fresh game = no entries yet. The list grows as `cellUpdated`
          // frames arrive (and any reconnect-time `lobbyState` snapshot
          // carries the authoritative server-side set). Same posture for
          // `lockedPositions`: empty until the first correct word fills.
          game: {
            puzzle: event.puzzle,
            entries: [],
            lockedPositions: [],
            startedAt: event.startedAt,
            completedAt: null,
          },
        },
      };
    case 'wordLocked': {
      // Append the just-locked positions to the cumulative set on the
      // active session. Dedupe so a stray duplicate from a server
      // re-broadcast never inflates the array (the `validatedPositions`
      // memo is keyed by string already, but keeping the source-of-truth
      // unique is still cheaper than keeping it dirty).
      const game = current.lobby.game;
      if (!game) return current;
      const seen = new Set<string>();
      const merged: LockedCell[] = [];
      // `?? []`: backend omits this field when empty due to
      // kotlinx-serialization `encodeDefaults=false`. Guard kept as
      // defense-in-depth against future schema drift.
      for (const p of game.lockedPositions ?? []) {
        const key = `${p.row},${p.column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(p);
      }
      // First-writer-wins (ADR-0086): dedup keeps the existing owner, so a
      // crossing cell already locked by an earlier word is never re-attributed.
      for (const p of event.positions) {
        const key = `${p.row},${p.column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ row: p.row, column: p.column, lockedBy: event.lockedBy });
      }
      return {
        ...current,
        lobby: {
          ...current.lobby,
          game: { ...game, lockedPositions: merged },
        },
      };
    }
    case 'gameSolved':
      return {
        ...current,
        lobby: {
          ...current.lobby,
          state: 'COMPLETED',
        },
        durationMs: event.durationMs,
        modalDismissed: false,
      };
    default:
      // `cellUpdated`, `presenceUpdated`, and `error` frames do not
      // change route-level state. Presence is overlay-only — the
      // overlay manages its own per-session map directly off the
      // event stream (see `subscribeToRemotePresence` above).
      return current;
  }
}
