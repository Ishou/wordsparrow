import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReconnectingGameClient } from '@/infrastructure';
import type {
  ConnectionState,
  GameClient,
  GameEvent,
  Unsubscribe,
} from '@/application/game';
import type { LobbyId, Pseudonym, SessionId } from '@/domain/game';

// In-memory fake of the inner GameClient. Lets tests drive transport
// transitions deterministically without standing up a real WebSocket.
// The `dispatchConnectionState` helper is the only way the fake exits
// the initial 'disconnected' state — tests build the sequence step by
// step so the wrapper's behaviour at each transition is observable.
function makeFakeInnerClient() {
  const connectCalls: Array<{ lobbyId: LobbyId; code?: string }> = [];
  const disconnectCalls = { count: 0 };
  const cellUpdateCalls: Array<{ row: number; column: number; letter: string | null }> = [];
  const connectionSubscribers = new Set<(s: ConnectionState) => void>();
  const eventSubscribers = new Set<(e: GameEvent) => void>();
  let connectionState: ConnectionState = 'disconnected';
  let pendingConnect: { resolve: () => void; reject: (e: Error) => void } | null = null;

  const setConnectionState = (next: ConnectionState) => {
    connectionState = next;
    for (const h of [...connectionSubscribers]) h(next);
  };

  const inner: GameClient = {
    connect: (args) => {
      connectCalls.push({ lobbyId: args.lobbyId, code: args.code });
      setConnectionState('connecting');
      return new Promise<void>((resolve, reject) => {
        pendingConnect = { resolve, reject };
      });
    },
    joinLobby: () => {},
    renameSelf: () => {},
    setGridConfig: () => {},
    startGame: () => {},
    cellUpdate: (row, column, letter) => {
      // Mirror the bare adapter: sends on a non-open socket throw.
      if (connectionState !== 'connected') {
        throw new Error('WebSocketGameClient: socket is not open');
      }
      cellUpdateCalls.push({ row, column, letter: letter as unknown as string | null });
    },
    cellFocus: () => {
      if (connectionState !== 'connected') {
        throw new Error('WebSocketGameClient: socket is not open');
      }
    },
    leaveLobby: () => {},
    rotateCode: () => {},
    disconnect: () => {
      disconnectCalls.count += 1;
      setConnectionState('disconnected');
    },
    subscribe: (handler) => {
      eventSubscribers.add(handler);
      return () => { eventSubscribers.delete(handler); };
    },
    subscribeConnectionState: (handler) => {
      connectionSubscribers.add(handler);
      handler(connectionState);
      return () => { connectionSubscribers.delete(handler); };
    },
  };

  return {
    inner,
    connectCalls,
    disconnectCalls,
    cellUpdateCalls,
    dispatchEvent: (event: GameEvent) => {
      for (const h of [...eventSubscribers]) h(event);
    },
    // Test helpers — pair with each pending inner.connect() promise.
    resolveOpen: () => {
      pendingConnect?.resolve();
      pendingConnect = null;
      setConnectionState('connected');
    },
    rejectAndClose: (err: Error) => {
      pendingConnect?.reject(err);
      pendingConnect = null;
      // Real WebSocket adapter: onerror is followed by onclose, which
      // sets 'disconnected'. Mirror that here.
      setConnectionState('disconnected');
    },
    // Mid-session drop — fires onclose without resolving a pending
    // connect promise.
    drop: () => { setConnectionState('disconnected'); },
    getConnectionState: () => connectionState,
  };
}

const collectStates = (client: GameClient): { states: ConnectionState[]; unsubscribe: Unsubscribe } => {
  const states: ConnectionState[] = [];
  const unsubscribe = client.subscribeConnectionState((s) => { states.push(s); });
  return { states, unsubscribe };
};

const lobbyId = '7gQ2xK9p' as LobbyId;
const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Joueur 1234' as Pseudonym;

const connectArgs = { lobbyId, sessionId, pseudonym };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReconnectingGameClient', () => {
  it('proxies connect() to the inner client and surfaces "connected" on success', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({ inner: fake.inner });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    expect(fake.connectCalls).toEqual([{ lobbyId, code: undefined }]);
    fake.resolveOpen();
    await p;

    // The wrapper primes with the initial 'disconnected' and then mirrors
    // the inner client's lifecycle: connecting → connected.
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);
  });

  it('retries instantly and silently after a drop from an established connection', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0, // deterministic timing
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);

    // Mid-session drop: NO externally-visible transition — the instant
    // retry is silent so a one-shot blip never surfaces any chrome.
    fake.drop();
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.connectCalls.length).toBe(2);
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);

    // Instant retry succeeds — still zero new state emissions.
    fake.resolveOpen();
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);
  });

  it('surfaces "reconnecting" and enters backoff only after the silent instant retry fails', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;

    fake.drop();
    await vi.advanceTimersByTimeAsync(0); // instant attempt fires
    expect(fake.connectCalls.length).toBe(2);
    fake.rejectAndClose(new Error('still down'));
    // Now — and only now — the outage becomes visible.
    expect(states.at(-1)).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(499);
    expect(fake.connectCalls.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.connectCalls.length).toBe(3);
  });

  it('uses exponential backoff capped at maxDelayMs after the instant first attempt', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      maxAttempts: 10,
      jitterRatio: 0,
    });
    collectStates(client);

    // Initial connect succeeds so we enter the reconnect loop with a
    // healthy session, then every subsequent reconnect FAILS so the
    // attempt counter grows monotonically and the delays exhibit pure
    // exponential growth (capped at maxDelayMs).
    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;

    fake.drop();
    // Attempt 1 is instant (silent), then the exponential ladder.
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.connectCalls.length).toBe(2);
    fake.rejectAndClose(new Error('still down'));

    const expectedDelays = [500, 1000, 2000, 4000, 4000];
    let priorConnects = 2;
    for (const delay of expectedDelays) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fake.connectCalls.length).toBe(priorConnects);
      await vi.advanceTimersByTimeAsync(1);
      priorConnects += 1;
      expect(fake.connectCalls.length).toBe(priorConnects);
      // Reject the in-flight attempt — fake emits 'disconnected' which
      // schedules the next attempt with the next exponential delay.
      fake.rejectAndClose(new Error('still down'));
    }
  });

  it('retries indefinitely by default (no terminal give-up)', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0,
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    fake.drop();

    // Fail 20 straight attempts — well past the old 6-attempt budget.
    for (let attempt = 0; attempt < 20; attempt++) {
      await vi.advanceTimersByTimeAsync(10_000);
      fake.rejectAndClose(new Error('still down'));
    }
    expect(fake.connectCalls.length).toBeGreaterThan(7);
    expect(states.at(-1)).toBe('reconnecting');

    // And a late recovery still lands.
    await vi.advanceTimersByTimeAsync(10_000);
    fake.resolveOpen();
    expect(states.at(-1)).toBe('connected');
  });

  it('resets the attempt counter after a successful reconnect', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });
    collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;

    // Drop, recover on the instant attempt — the next drop must get a
    // fresh silent instant attempt again, not a mid-ladder delay.
    fake.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.connectCalls.length).toBe(2);
    fake.resolveOpen();

    fake.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.connectCalls.length).toBe(3);
  });

  it('gives up after an explicit finite maxAttempts and emits a terminal "disconnected"', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      maxAttempts: 2,
      jitterRatio: 0,
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    fake.drop();
    // attempt 1 — instant
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.connectCalls.length).toBe(2);
    fake.rejectAndClose(new Error('boom'));
    // attempt 2 — last one
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.connectCalls.length).toBe(3);
    fake.rejectAndClose(new Error('boom'));
    // No further attempts; wrapper has emitted terminal 'disconnected'.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.connectCalls.length).toBe(3);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('does NOT reconnect after a voluntary disconnect()', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;

    client.disconnect();
    expect(fake.disconnectCalls.count).toBe(1);
    expect(states.at(-1)).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.connectCalls.length).toBe(1);
  });

  it('cancels a pending retry and does not reconnect when disconnect() is called during reconnecting state', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });
    const { states } = collectStates(client);

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;

    fake.drop();
    await vi.advanceTimersByTimeAsync(0); // instant silent attempt
    fake.rejectAndClose(new Error('still down'));
    expect(states.at(-1)).toBe('reconnecting');

    client.disconnect();
    expect(states.at(-1)).toBe('disconnected');
    expect(fake.disconnectCalls.count).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.connectCalls.length).toBe(2); // no further retry fired
  });

  it('forwards write-side methods straight through to the inner client while connected', async () => {
    const fake = makeFakeInnerClient();
    const startGameCalls = { count: 0 };
    const innerOverride: GameClient = {
      ...fake.inner,
      startGame: () => { startGameCalls.count += 1; },
    };
    const client = createReconnectingGameClient({ inner: innerOverride });

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    client.cellUpdate(1, 2, 'A' as never);
    client.startGame();

    expect(fake.cellUpdateCalls).toEqual([{ row: 1, column: 2, letter: 'A' }]);
    expect(startGameCalls.count).toBe(1);
  });

  it('replays the same connect args on each reconnect attempt (including optional code)', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });

    const p = client.connect({ ...connectArgs, code: 'A2B3C4' });
    fake.resolveOpen();
    await p;
    fake.drop();
    await vi.advanceTimersByTimeAsync(500);

    expect(fake.connectCalls).toEqual([
      { lobbyId, code: 'A2B3C4' },
      { lobbyId, code: 'A2B3C4' },
    ]);
  });

  it('queues cellUpdate during an outage and flushes after the rejoin lobbyState snapshot', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    fake.drop();

    // Typing while the socket is down must not throw; frames are queued
    // with last-write-wins per cell (LWW mirrors the server semantics).
    expect(() => {
      client.cellUpdate(0, 1, 'A' as never);
      client.cellUpdate(0, 2, 'B' as never);
      client.cellUpdate(0, 1, 'C' as never);
    }).not.toThrow();
    expect(fake.cellUpdateCalls).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);
    fake.resolveOpen();
    // Reconnected, but the server's replay snapshot has not arrived yet —
    // flushing now would let the stale snapshot overwrite the echoes.
    expect(fake.cellUpdateCalls).toEqual([]);

    fake.dispatchEvent({
      type: 'lobbyState',
      players: [],
      ownerSessionId: sessionId,
      state: 'IN_PROGRESS',
      gridConfig: { width: 5, height: 5 },
      code: 'A2B3C4',
      game: null,
    });
    expect(fake.cellUpdateCalls).toEqual([
      { row: 0, column: 2, letter: 'B' },
      { row: 0, column: 1, letter: 'C' },
    ]);

    // Queue is drained — a later snapshot must not re-send.
    fake.dispatchEvent({
      type: 'lobbyState',
      players: [],
      ownerSessionId: sessionId,
      state: 'IN_PROGRESS',
      gridConfig: { width: 5, height: 5 },
      code: 'A2B3C4',
      game: null,
    });
    expect(fake.cellUpdateCalls).toHaveLength(2);
  });

  it('drops queued cell writes on a voluntary disconnect', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    fake.drop();
    client.cellUpdate(0, 1, 'A' as never);

    client.disconnect();

    const p2 = client.connect(connectArgs);
    fake.resolveOpen();
    await p2;
    fake.dispatchEvent({
      type: 'lobbyState',
      players: [],
      ownerSessionId: sessionId,
      state: 'WAITING',
      gridConfig: { width: 5, height: 5 },
      code: 'A2B3C4',
      game: null,
    });
    expect(fake.cellUpdateCalls).toEqual([]);
  });

  it('silently drops cellFocus during an outage (ephemeral presence, never queued)', async () => {
    const fake = makeFakeInnerClient();
    const client = createReconnectingGameClient({
      inner: fake.inner,
      baseDelayMs: 500,
      jitterRatio: 0,
    });

    const p = client.connect(connectArgs);
    fake.resolveOpen();
    await p;
    fake.drop();

    expect(() => client.cellFocus(0, 1, 'across')).not.toThrow();
  });

  it('proxies event subscriptions to the inner client', () => {
    const subscribers = new Set<(e: GameEvent) => void>();
    const inner: GameClient = {
      ...makeFakeInnerClient().inner,
      subscribe: (h) => { subscribers.add(h); return () => { subscribers.delete(h); }; },
    };
    const client = createReconnectingGameClient({ inner });
    const received: GameEvent[] = [];
    const off = client.subscribe((e) => received.push(e));

    for (const s of subscribers) {
      s({ type: 'error', errorType: 'x', title: 't' });
    }
    expect(received).toHaveLength(1);
    off();
    for (const s of subscribers) {
      s({ type: 'error', errorType: 'x', title: 't' });
    }
    expect(received).toHaveLength(1);
  });
});
