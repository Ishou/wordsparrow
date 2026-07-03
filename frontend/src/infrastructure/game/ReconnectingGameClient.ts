// Reconnect-with-backoff wrapper around the bare `WebSocketGameClient`.
// Same `GameClient` port so the composition root substitutes one for
// the other transparently — every consumer (lobby route, presence
// overlay, banner / toast surfaces) keeps reading the wrapper through
// the application port and sees the wrapper's `reconnecting` state
// instead of the bare adapter's blunt `disconnected`.
//
// Why a wrapper and not a flag inside `WebSocketGameClient`:
//   * Layering — the bare adapter is the "browser primitive" (open a
//     socket, post frames, listen). Backoff policy is composition.
//   * Testability — the wrapper takes any `GameClient` and is exercised
//     against an in-memory fake; the bare adapter is tested with
//     `MockWebSocket`. The two test files stay focused.
//   * Reversibility — turning reconnection off is a one-line change in
//     `main.tsx` (drop the wrapper). No deep edits to the WS code.
//
// State machine the wrapper exposes via `subscribeConnectionState`:
//
//   disconnected ──connect()──▶ connecting ──inner 'connected'──▶ connected
//                                                                       │
//                                                                       │ inner 'disconnected' (involuntary)
//                                                                       ▼
//                                            silent instant retry (no state emission)
//                                                       │ fails
//                                                       ▼
//                                  attempts < max ? reconnecting (backoff delay) : disconnected (terminal)
//                                                       │
//                                                       │ timer fires
//                                                       ▼
//                                                  connecting ──→ (loop above)
//
// Notes on edge cases this handles:
//   1. The first `connect()` rejection still triggers retries — a flaky
//      network at lobby-mount should not require a manual reload.
//      The wrapper's `connect()` returns the inner's first promise
//      verbatim, so the caller still sees the rejection in its
//      `.catch()` and can decide what to surface; the wrapper retries
//      in parallel.
//   2. `disconnect()` sets a "voluntary close" flag the inner state
//      observer reads, so a clean shutdown does NOT schedule a retry.
//   3. `inner.connect()` cannot be called while a socket is held — the
//      bare adapter throws "already connected". The wrapper only calls
//      `connect` after the inner has emitted `'disconnected'`, which
//      the adapter only emits AFTER it clears its `socket` ref.
//   4. A drop from an ESTABLISHED connection gets one instant, silent
//      retry: no `reconnecting` emission, no mirrored `connecting`. A
//      one-shot blip (rollout-drained keep-alive, stale connection
//      reset) recovers with zero visible chrome; only when that instant
//      attempt fails does the outage surface and backoff begin.
//   5. `cellUpdate` while the socket is down is queued (last write per
//      cell wins — mirrors the server's LWW echo semantics) and flushed
//      after the reconnect's `lobbyState` replay snapshot, so the stale
//      snapshot cannot overwrite the flushed writes' echoes. `cellFocus`
//      is ephemeral presence and is dropped, never queued.

import type {
  ConnectionState,
  GameClient,
  GameEvent,
  Unsubscribe,
} from '@/application/game';
import type { LobbyId, Pseudonym, SessionId } from '@/domain/game';

type ScheduleFn = (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
type CancelFn = (handle: ReturnType<typeof setTimeout>) => void;
type RandomFn = () => number;

export interface ReconnectingGameClientOptions {
  readonly inner: GameClient;
  // Maximum reconnect attempts before the wrapper gives up and emits a
  // terminal `disconnected`. Default Infinity: a game-api JVM restart
  // outlasts any finite budget, so the wrapper retries for as long as
  // the lobby tab stays open (delay capped at `maxDelayMs`).
  readonly maxAttempts?: number;
  // Attempt 1 fires instantly; attempt 2 waits this long (ms), doubling
  // per attempt after that, capped at `maxDelayMs`. Default 500.
  readonly baseDelayMs?: number;
  // Maximum delay between attempts (ms). Default 10_000.
  readonly maxDelayMs?: number;
  // Multiplicative jitter half-width. Each scheduled delay is multiplied
  // by `1 + (random() * 2 - 1) * jitterRatio`. Default 0.15 — ±15 %.
  // Set to 0 in tests for deterministic timing.
  readonly jitterRatio?: number;
  // Test injection. Default `setTimeout` / `clearTimeout` / `Math.random`.
  readonly setTimeoutFn?: ScheduleFn;
  readonly clearTimeoutFn?: CancelFn;
  readonly randomFn?: RandomFn;
}

interface ConnectArgs {
  readonly lobbyId: LobbyId;
  readonly sessionId: SessionId;
  readonly pseudonym: Pseudonym;
  readonly code?: string;
}

const DEFAULT_MAX_ATTEMPTS = Number.POSITIVE_INFINITY;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_JITTER_RATIO = 0.15;

export function createReconnectingGameClient(
  options: ReconnectingGameClientOptions,
): GameClient {
  const inner = options.inner;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const schedule: ScheduleFn = options.setTimeoutFn ?? ((h, d) => setTimeout(h, d));
  const cancel: CancelFn = options.clearTimeoutFn ?? ((h) => clearTimeout(h));
  const random: RandomFn = options.randomFn ?? (() => Math.random());

  let lastConnectArgs: ConnectArgs | null = null;
  let attempts = 0;
  let delayHandle: ReturnType<typeof setTimeout> | null = null;
  let voluntaryClose = false;
  let started = false;
  // True while the instant post-drop attempt is in flight — suppresses
  // every state emission so a one-shot blip stays invisible (note 4).
  let silentAttempt = false;
  let lastInnerState: ConnectionState = 'disconnected';
  // Outage write queue (note 5) — insertion-ordered, last write per cell.
  const pendingCellWrites = new Map<
    string,
    { row: number; column: number; letter: Parameters<GameClient['cellUpdate']>[2] }
  >();

  let state: ConnectionState = 'disconnected';
  const subscribers = new Set<(s: ConnectionState) => void>();
  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    for (const h of [...subscribers]) h(next);
  };

  const clearPendingTimer = () => {
    if (delayHandle !== null) {
      cancel(delayHandle);
      delayHandle = null;
    }
  };

  const computeDelay = (attempt: number): number => {
    // attempt is 1-indexed; attempt 1 is instant, then exponential capped.
    if (attempt <= 1) return 0;
    const exp = baseDelayMs * 2 ** (attempt - 2);
    const capped = Math.min(exp, maxDelayMs);
    if (jitterRatio === 0) return capped;
    const factor = 1 + (random() * 2 - 1) * jitterRatio;
    return Math.max(0, Math.round(capped * factor));
  };

  const tryReconnect = () => {
    if (voluntaryClose) return;
    if (lastConnectArgs == null) return;
    attempts += 1;
    const args = lastConnectArgs;
    // The inner's connect() emits 'connecting' synchronously, which our
    // own state observer below mirrors. We swallow the promise rejection
    // here — the rejection path will surface as the inner emitting
    // `'disconnected'`, which kicks the next attempt (or terminal
    // disconnected if attempts are exhausted).
    void inner.connect(args).catch(() => undefined);
  };

  const scheduleNextAttempt = () => {
    if (attempts >= maxAttempts) {
      // Exhausted — emit terminal disconnected and stop.
      setState('disconnected');
      return;
    }
    if (!silentAttempt) setState('reconnecting');
    const delay = computeDelay(attempts + 1);
    delayHandle = schedule(() => {
      delayHandle = null;
      tryReconnect();
    }, delay);
  };

  const flushPendingCellWrites = () => {
    for (const [key, write] of pendingCellWrites) {
      try {
        inner.cellUpdate(write.row, write.column, write.letter);
        pendingCellWrites.delete(key);
      } catch {
        // Socket dropped mid-flush — keep the remainder for the next rejoin.
        return;
      }
    }
  };

  // Flush AFTER the rejoin `lobbyState` replay so the stale snapshot is
  // applied before our echoes arrive (note 5).
  inner.subscribe((event) => {
    if (event.type !== 'lobbyState') return;
    if (lastInnerState !== 'connected') return;
    if (pendingCellWrites.size === 0) return;
    flushPendingCellWrites();
  });

  // Mirror the inner client's connection state into the wrapper's, with
  // the reconnect/exhaustion logic layered on top of `disconnected`.
  inner.subscribeConnectionState((innerState) => {
    lastInnerState = innerState;
    if (!started) {
      // Pre-connect priming call (the inner adapter primes synchronously
      // on subscribe). Don't overwrite the wrapper's `disconnected`
      // initial state with a duplicate value.
      return;
    }
    if (innerState === 'connected') {
      attempts = 0;
      silentAttempt = false;
      clearPendingTimer();
      setState('connected');
      return;
    }
    if (innerState === 'connecting') {
      // Either the user's initial connect() OR a scheduled retry attempt.
      if (!silentAttempt) setState('connecting');
      return;
    }
    // innerState === 'disconnected' (the bare adapter does not emit
    // 'reconnecting'; that variant is reserved for this wrapper).
    if (voluntaryClose) {
      setState('disconnected');
      return;
    }
    if (silentAttempt) {
      // The instant attempt failed — the outage becomes visible now.
      silentAttempt = false;
    } else if (attempts === 0 && state === 'connected') {
      // Fresh drop from an established connection — go silent (note 4).
      silentAttempt = true;
    }
    scheduleNextAttempt();
  });

  return {
    connect(args) {
      lastConnectArgs = args;
      voluntaryClose = false;
      attempts = 0;
      silentAttempt = false;
      clearPendingTimer();
      started = true;
      setState('connecting');
      return inner.connect(args);
    },

    disconnect() {
      voluntaryClose = true;
      clearPendingTimer();
      pendingCellWrites.clear();
      inner.disconnect();
      // Defensive: ensure the wrapper's externally-visible state
      // matches even if the inner adapter does not emit 'disconnected'
      // for this clean shutdown.
      setState('disconnected');
    },

    joinLobby() { inner.joinLobby(); },
    renameSelf(pseudonym) { inner.renameSelf(pseudonym); },
    setGridConfig(config) { inner.setGridConfig(config); },
    startGame() { inner.startGame(); },
    cellUpdate(row, column, letter) {
      const key = `${row},${column}`;
      const enqueue = () => {
        // Re-insert so map order == order of LAST writes (LWW per cell).
        pendingCellWrites.delete(key);
        pendingCellWrites.set(key, { row, column, letter });
      };
      if (lastInnerState !== 'connected') {
        enqueue();
        return;
      }
      try {
        inner.cellUpdate(row, column, letter);
      } catch {
        enqueue();
      }
    },
    cellFocus(row, column, direction) {
      if (lastInnerState !== 'connected') return;
      try {
        inner.cellFocus(row, column, direction);
      } catch {
        // Ephemeral presence — a send racing the close is droppable.
      }
    },
    leaveLobby() { inner.leaveLobby(); },
    rotateCode() { inner.rotateCode(); },

    subscribe(handler: (event: GameEvent) => void): Unsubscribe {
      return inner.subscribe(handler);
    },

    subscribeConnectionState(handler: (s: ConnectionState) => void): Unsubscribe {
      subscribers.add(handler);
      handler(state);
      return () => { subscribers.delete(handler); };
    },
  };
}
