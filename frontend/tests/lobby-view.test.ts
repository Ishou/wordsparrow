import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@/application/game';
import type {
  GamePuzzle,
  Instant,
  Lobby,
  Pseudonym,
  SessionId,
} from '@/domain/game';
import { type LobbyView, deriveDurationMs, reduceLobby } from '@/ui/components/lobby/lobbyView';

const ownerSessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const joinerSessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;

const baseLobby: Lobby = {
  ownerSessionId,
  players: [{ sessionId: ownerSessionId, pseudonym: 'Hôte' as Pseudonym, joinedAt: '2026-05-02T15:30:00Z' as Instant }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
};

const baseView: LobbyView = { lobby: baseLobby, durationMs: null, modalDismissed: false };

const puzzle: GamePuzzle = {
  id: 'p1',
  title: 'Test',
  language: 'fr',
  width: 1,
  height: 1,
  hintsAllowed: 0,
  cells: [{ kind: 'letter', position: { row: 0, column: 0 }, letter: null }],
  clues: [],
  createdAt: '2026-05-02T15:31:00Z' as Instant,
};

describe('reduceLobby', () => {
  it('folds a representative event sequence (join → start → wordLocked → solved) into the expected LobbyView', () => {
    const sequence: GameEvent[] = [
      {
        type: 'playerJoined',
        sessionId: joinerSessionId,
        pseudonym: 'Joueur' as Pseudonym,
        joinedAt: '2026-05-02T15:30:01Z' as Instant,
      },
      { type: 'gameStarted', puzzle, startedAt: '2026-05-02T15:31:00Z' as Instant },
      { type: 'wordLocked', positions: [{ row: 0, column: 0 }], lockedAt: '2026-05-02T15:31:05Z' as Instant },
      { type: 'gameSolved', durationMs: 42_000, finalEntries: [] },
    ];

    const result = sequence.reduce(reduceLobby, baseView);

    expect(result.lobby.players).toHaveLength(2);
    expect(result.lobby.state).toBe('COMPLETED');
    expect(result.lobby.game?.lockedPositions).toEqual([{ row: 0, column: 0 }]);
    expect(result.durationMs).toBe(42_000);
    expect(result.modalDismissed).toBe(false);
  });

  it('replaces the entire snapshot on lobbyState', () => {
    const result = reduceLobby(baseView, {
      type: 'lobbyState',
      players: [{ sessionId: joinerSessionId, pseudonym: 'Seul' as Pseudonym, joinedAt: '2026-05-02T15:30:02Z' as Instant }],
      ownerSessionId: joinerSessionId,
      state: 'WAITING',
      gridConfig: { width: 9, height: 9 },
      code: 'ZZ9YY8',
      game: null,
    });

    expect(result.lobby.ownerSessionId).toBe(joinerSessionId);
    expect(result.lobby.gridConfig).toEqual({ width: 9, height: 9 });
    expect(result.lobby.code).toBe('ZZ9YY8');
  });

  it('dedupes a repeated playerJoined for an existing sessionId', () => {
    const joined = reduceLobby(baseView, {
      type: 'playerJoined',
      sessionId: joinerSessionId,
      pseudonym: 'Joueur' as Pseudonym,
      joinedAt: '2026-05-02T15:30:01Z' as Instant,
    });
    const again = reduceLobby(joined, {
      type: 'playerJoined',
      sessionId: joinerSessionId,
      pseudonym: 'Joueur' as Pseudonym,
      joinedAt: '2026-05-02T15:30:01Z' as Instant,
    });
    expect(again).toBe(joined);
    expect(again.lobby.players).toHaveLength(2);
  });

  it('removes a player on playerLeft', () => {
    const joined = reduceLobby(baseView, {
      type: 'playerJoined',
      sessionId: joinerSessionId,
      pseudonym: 'Joueur' as Pseudonym,
      joinedAt: '2026-05-02T15:30:01Z' as Instant,
    });
    const left = reduceLobby(joined, { type: 'playerLeft', sessionId: joinerSessionId });
    expect(left.lobby.players.map((p) => p.sessionId)).toEqual([ownerSessionId]);
  });

  it('applies a rename to the matching player only', () => {
    const renamed = reduceLobby(baseView, {
      type: 'playerRenamed',
      sessionId: ownerSessionId,
      newPseudonym: 'Nouveau' as Pseudonym,
    });
    expect(renamed.lobby.players[0]!.pseudonym).toBe('Nouveau');
  });

  it('dedupes wordLocked positions across re-broadcasts', () => {
    const started = reduceLobby(baseView, {
      type: 'gameStarted',
      puzzle,
      startedAt: '2026-05-02T15:31:00Z' as Instant,
    });
    const once = reduceLobby(started, {
      type: 'wordLocked',
      positions: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
      lockedAt: '2026-05-02T15:31:05Z' as Instant,
    });
    const twice = reduceLobby(once, {
      type: 'wordLocked',
      positions: [{ row: 0, column: 1 }],
      lockedAt: '2026-05-02T15:31:06Z' as Instant,
    });
    expect(twice.lobby.game?.lockedPositions).toEqual([{ row: 0, column: 0 }, { row: 0, column: 1 }]);
  });

  it('leaves the view untouched for overlay-only frames (cellUpdated)', () => {
    const result = reduceLobby(baseView, {
      type: 'cellUpdated',
      sessionId: ownerSessionId,
      row: 0,
      column: 0,
      letter: 'A' as never,
      writtenAt: '2026-05-02T15:31:02Z' as Instant,
    });
    expect(result).toBe(baseView);
  });
});

describe('deriveDurationMs', () => {
  it('keeps a live duration when one is already set', () => {
    expect(deriveDurationMs(1234, 'COMPLETED', null)).toBe(1234);
  });

  it('derives completedAt − startedAt for a reload-into-COMPLETED snapshot', () => {
    const game = {
      puzzle,
      entries: [],
      lockedPositions: [],
      startedAt: '2026-05-02T15:30:00Z' as Instant,
      completedAt: '2026-05-02T15:30:30Z' as Instant,
    };
    expect(deriveDurationMs(null, 'COMPLETED', game)).toBe(30_000);
  });

  it('returns null while still in progress', () => {
    expect(deriveDurationMs(null, 'IN_PROGRESS', null)).toBeNull();
  });
});
