import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ConnectionState,
  type GameClient,
  type GameEvent,
} from '@/application/game';
import type {
  GamePuzzle,
  GridConfig,
  Instant,
  Letter,
  Lobby,
  LobbyId,
  Pseudonym,
  SessionId,
} from '@/domain/game';
import {
  type LobbyConnectionArgs,
  useLobbyConnection,
} from '@/ui/components/lobby/useLobbyConnection';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const otherSessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;
const pseudonym = 'Hôte' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;

const baseLobby: Lobby = {
  ownerSessionId: sessionId,
  players: [{ sessionId, pseudonym, joinedAt: '2026-05-02T15:30:00Z' as Instant }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
};

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

interface FakeGameClient extends GameClient {
  readonly connectCalls: Array<{ lobbyId: LobbyId; code?: string }>;
  readonly disconnectCalls: { count: number };
  readonly renameCalls: Pseudonym[];
  readonly setGridConfigCalls: GridConfig[];
  readonly startGameCalls: { count: number };
  readonly rotateCalls: { count: number };
  readonly leaveCalls: { count: number };
  readonly cellUpdateCalls: Array<{ row: number; column: number; letter: Letter | null }>;
  readonly cellFocusCalls: Array<{
    row: number | null;
    column: number | null;
    direction: 'across' | 'down' | null;
  }>;
  readonly subscriberCount: () => number;
  readonly dispatch: (event: GameEvent) => void;
  readonly dispatchConnectionState: (state: ConnectionState) => void;
}

const makeFakeGameClient = (): FakeGameClient => {
  const subscribers = new Set<(e: GameEvent) => void>();
  const connectionSubscribers = new Set<(s: ConnectionState) => void>();
  let connectionState: ConnectionState = 'connecting';
  const connectCalls: Array<{ lobbyId: LobbyId; code?: string }> = [];
  const disconnectCalls = { count: 0 };
  const renameCalls: Pseudonym[] = [];
  const setGridConfigCalls: GridConfig[] = [];
  const startGameCalls = { count: 0 };
  const rotateCalls = { count: 0 };
  const leaveCalls = { count: 0 };
  const cellUpdateCalls: Array<{ row: number; column: number; letter: Letter | null }> = [];
  const cellFocusCalls: Array<{
    row: number | null;
    column: number | null;
    direction: 'across' | 'down' | null;
  }> = [];
  return {
    connectCalls,
    disconnectCalls,
    renameCalls,
    setGridConfigCalls,
    startGameCalls,
    rotateCalls,
    leaveCalls,
    cellUpdateCalls,
    cellFocusCalls,
    subscriberCount: () => subscribers.size,
    dispatch: (event) => { for (const s of [...subscribers]) s(event); },
    dispatchConnectionState: (state) => {
      connectionState = state;
      for (const s of [...connectionSubscribers]) s(state);
    },
    connect: (args) => { connectCalls.push({ lobbyId: args.lobbyId, code: args.code }); return Promise.resolve(); },
    joinLobby: () => {},
    renameSelf: (p) => { renameCalls.push(p); },
    setGridConfig: (config) => { setGridConfigCalls.push(config); },
    startGame: () => { startGameCalls.count += 1; },
    cellUpdate: (row, column, letter) => { cellUpdateCalls.push({ row, column, letter }); },
    cellFocus: (row, column, direction) => { cellFocusCalls.push({ row, column, direction }); },
    leaveLobby: () => { leaveCalls.count += 1; },
    rotateCode: () => { rotateCalls.count += 1; },
    disconnect: () => { disconnectCalls.count += 1; },
    subscribe: (handler) => { subscribers.add(handler); return () => { subscribers.delete(handler); }; },
    subscribeConnectionState: (handler) => {
      connectionSubscribers.add(handler);
      handler(connectionState);
      return () => { connectionSubscribers.delete(handler); };
    },
  };
};

const makeArgs = (
  gameClient: FakeGameClient,
  overrides: Partial<LobbyConnectionArgs> = {},
): LobbyConnectionArgs => ({
  lobbyId,
  initialLobby: baseLobby,
  gameClient,
  getSession: () => ({ sessionId, pseudonym }),
  setPersistedPseudonym: vi.fn(),
  lobbyJoinCodeStash: { read: () => null, clear: () => {} },
  showToast: vi.fn(),
  dismissToast: vi.fn(),
  announce: vi.fn(),
  onJoinDenied: vi.fn(),
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('useLobbyConnection lifecycle', () => {
  it('connects on mount with the lobby id and disconnects on unmount', () => {
    const gameClient = makeFakeGameClient();
    const { unmount } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    expect(gameClient.connectCalls).toEqual([{ lobbyId, code: undefined }]);
    expect(gameClient.disconnectCalls.count).toBe(0);
    unmount();
    expect(gameClient.disconnectCalls.count).toBe(1);
    expect(gameClient.subscriberCount()).toBe(0);
  });

  it('passes the stashed join code into connect', () => {
    const gameClient = makeFakeGameClient();
    renderHook(() =>
      useLobbyConnection(
        makeArgs(gameClient, {
          lobbyJoinCodeStash: { read: () => 'ZZ9YY8', clear: () => {} },
        }),
      ),
    );
    expect(gameClient.connectCalls[0]!.code).toBe('ZZ9YY8');
  });

  it('starts joinConfirmed when the local session is already in the snapshot', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    expect(result.current.joinConfirmed).toBe(true);
  });

  it('flips joinConfirmed on the local playerJoined frame', () => {
    const gameClient = makeFakeGameClient();
    const lobbyWithoutSelf: Lobby = {
      ...baseLobby,
      ownerSessionId: otherSessionId,
      players: [{ sessionId: otherSessionId, pseudonym: 'Autre' as Pseudonym, joinedAt: '2026-05-02T15:30:00Z' as Instant }],
    };
    const { result } = renderHook(() =>
      useLobbyConnection(makeArgs(gameClient, { initialLobby: lobbyWithoutSelf })),
    );
    expect(result.current.joinConfirmed).toBe(false);
    act(() => {
      gameClient.dispatch({ type: 'playerJoined', sessionId, pseudonym, joinedAt: '2026-05-02T15:30:05Z' as Instant });
    });
    expect(result.current.joinConfirmed).toBe(true);
  });
});

describe('useLobbyConnection view reduction', () => {
  it('folds dispatched events into the view via reduceLobby', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => {
      gameClient.dispatch({ type: 'playerJoined', sessionId: otherSessionId, pseudonym: 'Joueur' as Pseudonym, joinedAt: '2026-05-02T15:30:01Z' as Instant });
    });
    expect(result.current.view.lobby.players).toHaveLength(2);
    act(() => {
      gameClient.dispatch({ type: 'gameStarted', puzzle, startedAt: '2026-05-02T15:31:00Z' as Instant });
    });
    expect(result.current.view.lobby.state).toBe('IN_PROGRESS');
    expect(result.current.gridPuzzle).not.toBeNull();
  });

  it('opens the modal duration on gameSolved and closeModal dismisses it', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => {
      gameClient.dispatch({ type: 'gameStarted', puzzle, startedAt: '2026-05-02T15:31:00Z' as Instant });
      gameClient.dispatch({ type: 'gameSolved', durationMs: 42_000, finalEntries: [] });
    });
    expect(result.current.view.lobby.state).toBe('COMPLETED');
    expect(result.current.view.durationMs).toBe(42_000);
    expect(result.current.view.modalDismissed).toBe(false);
    act(() => result.current.actions.closeModal());
    expect(result.current.view.modalDismissed).toBe(true);
  });
});

describe('useLobbyConnection actions', () => {
  it('start() flips isStarting and calls gameClient.startGame; gameStarted clears it', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.start());
    expect(gameClient.startGameCalls.count).toBe(1);
    expect(result.current.isStarting).toBe(true);
    act(() => {
      gameClient.dispatch({ type: 'gameStarted', puzzle, startedAt: '2026-05-02T15:31:00Z' as Instant });
    });
    expect(result.current.isStarting).toBe(false);
  });

  it('rename() forwards to renameSelf', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.rename('Nouveau' as Pseudonym));
    expect(gameClient.renameCalls).toEqual(['Nouveau']);
  });

  it('setGridConfig() forwards both axes', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.setGridConfig(9, 11));
    expect(gameClient.setGridConfigCalls).toEqual([{ width: 9, height: 11 }]);
  });

  it('rotateCode() flips isRotating and clears it on a fresh code snapshot', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.rotateCode());
    expect(gameClient.rotateCalls.count).toBe(1);
    expect(result.current.isRotating).toBe(true);
    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: baseLobby.players,
        ownerSessionId: sessionId,
        state: 'WAITING',
        gridConfig: { width: 7, height: 7 },
        code: 'NEW123',
        game: null,
      });
    });
    expect(result.current.isRotating).toBe(false);
  });

  it('leave() forwards to gameClient.leaveLobby without disconnecting itself', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.leave());
    expect(gameClient.leaveCalls.count).toBe(1);
    // leave() owns no navigation/teardown — the caller navigates, unmount disconnects.
    expect(gameClient.disconnectCalls.count).toBe(0);
  });

  it('cellUpdate() forwards row/column/letter', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.cellUpdate(1, 2, 'A'));
    expect(gameClient.cellUpdateCalls).toEqual([{ row: 1, column: 2, letter: 'A' }]);
  });

  it('cellFocus() maps a {row,col} position into row/column/direction', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => result.current.actions.cellFocus({ row: 3, col: 4 }, 'across'));
    act(() => result.current.actions.cellFocus(null, null));
    expect(gameClient.cellFocusCalls).toEqual([
      { row: 3, column: 4, direction: 'across' },
      { row: null, column: null, direction: null },
    ]);
  });
});

describe('useLobbyConnection error + connection seams', () => {
  it('surfaces an unhandled error frame via the toast seam', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { showToast })));
    act(() => {
      gameClient.dispatch({ type: 'error', errorType: 'https://bliss.example/errors/not-owner', title: 'Opération réservée au propriétaire' });
    });
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Opération réservée au propriétaire', tone: 'error' }),
    );
  });

  it('sets pseudonymError on invalid-pseudonym and clears it via clearPseudonymError', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => {
      gameClient.dispatch({ type: 'error', errorType: 'https://bliss.example/errors/invalid-pseudonym', title: 'Pseudonyme invalide', detail: 'Trop long' });
    });
    expect(result.current.pseudonymError).toBe('Trop long');
    act(() => result.current.actions.clearPseudonymError());
    expect(result.current.pseudonymError).toBeNull();
  });

  it('routes a pre-join wrong-code error to onJoinDenied', () => {
    const gameClient = makeFakeGameClient();
    const onJoinDenied = vi.fn();
    const lobbyWithoutSelf: Lobby = {
      ...baseLobby,
      ownerSessionId: otherSessionId,
      players: [{ sessionId: otherSessionId, pseudonym: 'Autre' as Pseudonym, joinedAt: '2026-05-02T15:30:00Z' as Instant }],
    };
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { onJoinDenied, initialLobby: lobbyWithoutSelf })));
    act(() => {
      gameClient.dispatch({ type: 'error', errorType: 'https://bliss.example/errors/wrong-code', title: 'Refusé', detail: 'Code invalide' });
    });
    expect(onJoinDenied).toHaveBeenCalledWith('Code invalide');
  });

  it('flags evicted (not joinDenied) on a post-join wrong-code rejoin denial', () => {
    const gameClient = makeFakeGameClient();
    const dismissToast = vi.fn();
    const onJoinDenied = vi.fn();
    const showToast = vi.fn();
    const args = makeArgs(gameClient, { dismissToast, onJoinDenied, showToast });
    const { result } = renderHook(() => useLobbyConnection(args));
    act(() => gameClient.dispatchConnectionState('connected'));
    expect(result.current.joinConfirmed).toBe(true);
    expect(result.current.evicted).toBe(false);
    // ADR-0018 §5 grace elapsed during an outage; the codeless rejoin is denied.
    act(() => {
      gameClient.dispatch({ type: 'error', errorType: 'https://bliss.example/errors/wrong-code', title: 'Code de partie invalide', status: 403 });
    });
    expect(result.current.evicted).toBe(true);
    // Retry loop torn down; no misleading chrome — no bounce, no error toast, no lost-toast from the teardown disconnect.
    expect(gameClient.disconnectCalls.count).toBe(1);
    expect(dismissToast).toHaveBeenCalled();
    expect(onJoinDenied).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('flags evicted on a post-join lobby-full rejoin denial', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => gameClient.dispatchConnectionState('connected'));
    act(() => {
      gameClient.dispatch({ type: 'error', errorType: 'https://bliss.example/errors/lobby-full', title: 'Salon complet', status: 409 });
    });
    expect(result.current.evicted).toBe(true);
  });

  it('tracks the connectionState stream', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    expect(result.current.connectionState).toBe('connecting');
    act(() => gameClient.dispatchConnectionState('connected'));
    expect(result.current.connectionState).toBe('connected');
    act(() => gameClient.dispatchConnectionState('disconnected'));
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('shows ONE sticky toast per lost transition — not one per retry attempt', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    const announce = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { showToast, announce })));
    act(() => gameClient.dispatchConnectionState('connected'));
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith({
      text: 'Connexion perdue — reconnexion en cours…',
      tone: 'info',
      duration: null,
    });
    // Toast owns its own aria-live region (Toast.tsx) — no separate announce() call.
    expect(announce).not.toHaveBeenCalled();
    // The retry loop cycles reconnecting → connecting → reconnecting… — no additional toast per attempt.
    act(() => gameClient.dispatchConnectionState('connecting'));
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    act(() => gameClient.dispatchConnectionState('connecting'));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('replaces the sticky toast with a brief « Connexion rétablie » on recovery', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    const announce = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { showToast, announce })));
    act(() => gameClient.dispatchConnectionState('connected'));
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    act(() => gameClient.dispatchConnectionState('connecting'));
    act(() => gameClient.dispatchConnectionState('connected'));
    expect(showToast).toHaveBeenLastCalledWith({ text: 'Connexion rétablie', tone: 'info' });
    // Toast owns its own aria-live region (Toast.tsx) — no separate announce() call.
    expect(announce).not.toHaveBeenCalled();

    // A second outage re-arms the pair.
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    expect(showToast).toHaveBeenLastCalledWith({
      text: 'Connexion perdue — reconnexion en cours…',
      tone: 'info',
      duration: null,
    });
  });

  it('treats a terminal disconnected like any other lost state — toast, no bounce seam', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    const onJoinDenied = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { showToast, onJoinDenied })));
    act(() => gameClient.dispatchConnectionState('connected'));
    act(() => gameClient.dispatchConnectionState('disconnected'));
    expect(showToast).toHaveBeenCalledWith({
      text: 'Connexion perdue — reconnexion en cours…',
      tone: 'info',
      duration: null,
    });
    expect(onJoinDenied).not.toHaveBeenCalled();
  });

  it('never toasts before the first successful connection', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { showToast })));
    act(() => gameClient.dispatchConnectionState('disconnected'));
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('flags lobbyGone and stops the retry loop on a 404 protocol error frame', () => {
    const gameClient = makeFakeGameClient();
    const showToast = vi.fn();
    const dismissToast = vi.fn();
    const onJoinDenied = vi.fn();
    // Stable args: a fresh `getSession` per render would re-run the mount effect and skew the disconnect count below.
    const args = makeArgs(gameClient, { showToast, dismissToast, onJoinDenied });
    const { result } = renderHook(() => useLobbyConnection(args));
    act(() => gameClient.dispatchConnectionState('connected'));
    expect(result.current.lobbyGone).toBe(false);
    act(() => {
      gameClient.dispatch({
        type: 'error',
        errorType: 'https://bliss.example/errors/protocol',
        title: 'Salon introuvable',
        detail: "Aucun salon avec l'identifiant 7gQ2xK9p n'existe.",
        status: 404,
      });
    });
    expect(result.current.lobbyGone).toBe(true);
    // Voluntary disconnect kills the reconnect loop; the sticky toast goes.
    expect(gameClient.disconnectCalls.count).toBe(1);
    expect(dismissToast).toHaveBeenCalled();
    // Neither the generic error toast nor the join-denied bounce fires.
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    expect(onJoinDenied).not.toHaveBeenCalled();
  });

  it('re-seeds initialEntries from the rejoin lobbyState replay (board resync)', () => {
    const gameClient = makeFakeGameClient();
    const { result } = renderHook(() => useLobbyConnection(makeArgs(gameClient)));
    act(() => gameClient.dispatchConnectionState('connected'));
    expect(result.current.initialEntries).toEqual([]);
    // Reconnect: the server replays the full snapshot on every WS rejoin (LobbyWebSocketRoute sends lobbyState per socket).
    act(() => gameClient.dispatchConnectionState('reconnecting'));
    act(() => gameClient.dispatchConnectionState('connected'));
    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: baseLobby.players,
        ownerSessionId: sessionId,
        state: 'IN_PROGRESS',
        gridConfig: { width: 1, height: 1 },
        code: 'A2B3C4',
        game: {
          puzzle,
          startedAt: '2026-05-02T15:31:00Z' as Instant,
          completedAt: null,
          entries: [{ sessionId, row: 0, column: 0, letter: 'A' as Letter, writtenAt: '2026-05-02T15:32:00Z' as Instant }],
          presence: [],
          lockedPositions: [],
        },
      });
    });
    expect(result.current.initialEntries).toEqual([{ row: 0, column: 0, letter: 'A' }]);
  });

  it('announces a peer joining via the announce seam', () => {
    const gameClient = makeFakeGameClient();
    const announce = vi.fn();
    renderHook(() => useLobbyConnection(makeArgs(gameClient, { announce })));
    act(() => {
      gameClient.dispatch({ type: 'playerJoined', sessionId: otherSessionId, pseudonym: 'Joueur' as Pseudonym, joinedAt: '2026-05-02T15:30:05Z' as Instant });
    });
    expect(announce).toHaveBeenCalledWith('Joueur a rejoint la partie');
  });
});
