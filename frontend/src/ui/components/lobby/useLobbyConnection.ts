import { shareOrCopyInviteUrl, type ShareInviteResult } from '@/ui/lib/shareInvite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ConnectionState,
  type GameClient,
  type GameEvent,
} from '@/application/game';
import type { Position, Puzzle } from '@/domain';
import type {
  Letter,
  Lobby,
  LobbyId,
  Player,
  PresenceEntry,
  Pseudonym,
  SessionId,
} from '@/domain/game';
import type { ToastOptions } from '@/ui/components/primitives';
import { type LobbyView, deriveDurationMs, reduceLobby } from './lobbyView';
import {
  type MultiAnnounceContext,
  gamePuzzleToPuzzle,
  multiAnnouncementFor,
} from './lobbyEvents';

export type { LobbyView } from './lobbyView';

// Seams injected so the hook is testable without infrastructure imports.
export interface LobbyConnectionArgs {
  readonly lobbyId: LobbyId;
  readonly initialLobby: Lobby;
  readonly gameClient: GameClient;
  readonly getSession: () => { readonly sessionId: SessionId; readonly pseudonym: Pseudonym };
  readonly setPersistedPseudonym?: (pseudonym: Pseudonym) => void;
  readonly lobbyJoinCodeStash: {
    readonly read: (lobbyId: LobbyId) => string | null;
    readonly clear: (lobbyId: LobbyId) => void;
  };
  readonly showToast: (toast: ToastOptions) => void;
  readonly dismissToast: () => void;
  readonly announce: (text: string) => void;
  readonly onJoinDenied: (message: string) => void;
}

// Returned by useLobbyConnection; consumed by both the prod route and v2 routes.
export interface LobbyConnection {
  readonly view: LobbyView;
  readonly connectionState: ConnectionState;
  readonly pseudonymError: string | null;
  readonly joinDenied: string | null;
  readonly joinConfirmed: boolean;
  // True once the server said the lobby no longer exists (404 protocol frame on rejoin) — the route renders the introuvable screen.
  readonly lobbyGone: boolean;
  readonly isStarting: boolean;
  readonly isRotating: boolean;
  // Local session identity — renderers mark the local row / gate owner controls without re-reading `getSession`.
  readonly sessionId: SessionId;
  // Derived render-ready values (memoised): UI-shape puzzle, initial entries seed, sessionId→Player lookup.
  readonly gridPuzzle: Puzzle | null;
  readonly initialEntries: ReadonlyArray<{ row: number; column: number; letter: string }>;
  readonly playersBySessionId: ReadonlyMap<SessionId, Player>;
  readonly actions: LobbyActions;
}

export interface LobbyActions {
  readonly rename: (pseudonym: Pseudonym) => void;
  readonly setGridConfig: (width: number, height: number) => void;
  readonly start: () => void;
  readonly rotateCode: () => void;
  // See ShareInviteResult (shareInvite.ts) for the gating rule; `null` when there's no code to share yet.
  readonly copyShareUrl: () => Promise<ShareInviteResult | null>;
  // Voluntary leave: frees the slot server-side. Navigation is the caller's concern — the hook owns no navigate seam.
  readonly leave: () => void;
  readonly clearPseudonymError: () => void;
  readonly closeModal: () => void;
  // `string | null` matches the Grid hook's report shape; normalised to uppercase so the `Letter` cast is sound.
  readonly cellUpdate: (row: number, column: number, letter: string | null) => void;
  // Position is the UI-shape `{ row, col }`; `null` means no cell focused.
  readonly cellFocus: (
    position: Position | null,
    direction: 'across' | 'down' | null,
  ) => void;
  // Stable registrars; the presence registrar replays the current snapshot synchronously before forwarding live frames.
  readonly subscribeToRemoteCellUpdates: (handler: (event: GameEvent) => void) => () => void;
  readonly subscribeToRemotePresence: (handler: (event: GameEvent) => void) => () => void;
}

// LobbyWebSocketRoute answers a rejoin against an unknown lobby with a protocol error frame carrying status 404 before closing the socket.
const isLobbyGoneFrame = (event: GameEvent): boolean =>
  event.type === 'error' &&
  event.errorType === 'https://bliss.example/errors/protocol' &&
  event.status === 404;

export function useLobbyConnection(args: LobbyConnectionArgs): LobbyConnection {
  const {
    lobbyId,
    initialLobby,
    gameClient,
    getSession,
    setPersistedPseudonym,
    lobbyJoinCodeStash,
    showToast,
    dismissToast,
    announce,
    onJoinDenied,
  } = args;

  // Ref keeps the subscribe handler stable across re-renders.
  const setPersistedPseudonymRef = useRef(setPersistedPseudonym);
  setPersistedPseudonymRef.current = setPersistedPseudonym;

  const [view, setView] = useState<LobbyView>(() => ({
    lobby: initialLobby,
    // Seed `durationMs` from the loader snapshot so the modal opens on a hard refresh into a COMPLETED lobby (no live `gameSolved` arrives in that path).
    durationMs: deriveDurationMs(null, initialLobby.state, initialLobby.game),
    modalDismissed: false,
  }));
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  // Inline pseudonym-rename error surfaced by the WaitingRoom editor.
  // The server emits an `invalid-pseudonym` error frame when the rename
  // payload fails the `Pseudonym` invariants (over MAX_LENGTH, empty,
  // leading/trailing whitespace). Stored here because (a) WaitingRoom is
  // intentionally pure and (b) a successful rename arriving as
  // `playerRenamed` clears the slate.
  const [pseudonymError, setPseudonymError] = useState<string | null>(null);
  const clearPseudonymError = useCallback(() => {
    setPseudonymError(null);
  }, []);
  // ADR-0027: when the server rejects the WS join with `wrong-code`
  // (no code or mismatched code on a new join), the route does NOT
  // mount the WaitingRoom — the un-authorised user lands on a
  // read-only-snapshot view with this banner asking the organiser
  // for the code. Already-joined sessions never raise this.
  const [joinDenied, setJoinDenied] = useState<string | null>(null);
  // Server-confirmed "this lobby no longer exists" — the only case that may claim the game is gone (honest 404, never a transient outage).
  const [lobbyGone, setLobbyGone] = useState(false);
  // ADR-0027: gate the WaitingRoom render on a confirmed join so a new
  // joiner whose code the server is about to reject doesn't see the
  // lobby contents (player list with the owner) flash before the
  // wrong-code banner takes over. Already-joined sessions (reconnect
  // path: sessionId is already in the snapshot's player list) start
  // confirmed because the server's reconnect branch never fails.
  const initialSessionId = getSession().sessionId;
  const [joinConfirmed, setJoinConfirmed] = useState<boolean>(() =>
    initialLobby.players.some((p) => p.sessionId === initialSessionId),
  );
  // Mirrored as a ref so the long-lived subscribe callback can branch
  // on whether the user has been admitted into the lobby yet — without
  // re-attaching the listener on every state change. Pre-join error
  // frames (e.g. `protocol` when the join hasn't completed) get a
  // different treatment than the same frame post-join.
  const joinConfirmedRef = useRef(joinConfirmed);
  joinConfirmedRef.current = joinConfirmed;
  // True between "Démarrer la partie" click and the server-side
  // confirmation. WaitingRoom uses the flag to disable the button and
  // flip the label to "Démarrage…" so the WS round-trip (frame →
  // server → broadcast) is not perceived as a dead click.
  const [isStarting, setIsStarting] = useState(false);
  // Mirrored as a ref so the long-lived `subscribe` callback (set up
  // once per `useEffect` run) can read the latest value without being
  // re-attached on every state flip. Used to disambiguate "the error
  // we just received likely killed the start-game flow" from "a stray
  // server error unrelated to the in-flight Start click".
  const isStartingRef = useRef(isStarting);
  isStartingRef.current = isStarting;
  // ADR-0029: rotation spinner; cleared in the subscribe handler below.
  const [isRotating, setIsRotating] = useState(false);
  const preRotationCodeRef = useRef<string | null>(null);
  // Skip initial `connecting` — first `connected` arms the ref; only then do transient drops earn toast chrome.
  const hasConnectedRef = useRef(false);
  // One toast per LOST transition (ADR-0050 one-shot rule) — the retry loop's reconnecting/connecting churn stays silent.
  const connectionLostRef = useRef(false);

  // Single side effect: connect on mount, disconnect on unmount.
  // `joinLobby` is auto-sent by the adapter inside `connect` (the
  // WebSocketGameClient sends the handshake on `onopen`), so the route
  // does not call `joinLobby()` again. Connect failures are non-fatal
  // because the `ConnectionBanner` surfaces transport health.
  useEffect(() => {
    const { sessionId, pseudonym } = getSession();
    const unsubscribeEvents = gameClient.subscribe((event) => {
      setView((current) => reduceLobby(current, event));
      // Surface `invalid-pseudonym` errors inline next to the editor;
      // clear the inline error once the server confirms the rename via
      // `playerRenamed` for the local session.
      if (event.type === 'error' &&
        event.errorType === 'https://bliss.example/errors/invalid-pseudonym') {
        setPseudonymError(event.detail ?? event.title);
      } else if (event.type === 'playerRenamed' && event.sessionId === sessionId) {
        setPseudonymError(null);
        // Persist server-confirmed value; rejected pseudonym must never reach cache.
        setPersistedPseudonymRef.current?.(event.newPseudonym);
      }
      if (event.type === 'error' &&
        event.errorType === 'https://bliss.example/errors/wrong-code') {
        // Server rejected the join — the WaitingRoom does not mount.
        // The joinDenied effect navigates back to home with a toast
        // carrying the message, so the in-progress grid / waiting
        // roster never reaches the denied joiner's DOM.
        // Drop the stash so a later reload doesn't replay the bad code.
        setJoinDenied(event.detail ?? 'Code invalide ou partie privée. Demandez le code à l’organisateur.');
        lobbyJoinCodeStash.clear(lobbyId);
      }
      // Server-confirmed lobby-unknown (WS rejoin against a GC'd / wiped lobby) — the route swaps to the introuvable screen.
      if (isLobbyGoneFrame(event)) {
        setLobbyGone(true);
      }
      // `protocol` errors before the join completes mean the server
      // saw a client→server frame other than `joinLobby` first —
      // either a bug in our wire ordering or a stale frame from a
      // previous mount. The wire `detail` ("Envoyez une trame
      // 'joinLobby'…") is internal protocol language and never
      // surfaces to the user; we hand them a generic French message
      // and bounce to home. Post-join `protocol` errors fall through
      // to the normal toast path (e.g. a malformed cellUpdate would
      // earn an in-game toast rather than booting the user out).
      if (event.type === 'error' &&
        event.errorType === 'https://bliss.example/errors/protocol' &&
        !isLobbyGoneFrame(event) &&
        !joinConfirmedRef.current) {
        setJoinDenied('Impossible de rejoindre cette partie. Réessaie.');
        lobbyJoinCodeStash.clear(lobbyId);
      }
      // First `playerJoined` for our own sessionId confirms the WS join
      // — flip on the WaitingRoom render. Clear the stash now that the
      // server has accepted us; future reconnects bypass the code.
      // (Reconnect path: sessionId already in the snapshot's player
      // list, handled at mount time via the initial-state computation
      // above.)
      if (event.type === 'playerJoined' && event.sessionId === sessionId) {
        setJoinConfirmed(true);
        lobbyJoinCodeStash.clear(lobbyId);
      }
      // Clear the in-flight Start spinner once the server either
      // confirms the new game or rejects the request. `gameStarted`
      // also unmounts WaitingRoom, but resetting the flag is good
      // hygiene for any future code path that reuses the component
      // (e.g. a play-again flow that re-enters WAITING).
      if (event.type === 'gameStarted' || event.type === 'error') {
        setIsStarting(false);
      }
      // Surface server `error` frames not handled inline (i.e. neither
      // `invalid-pseudonym` next-to-the-editor nor `wrong-code`
      // join-denied banner) via a toast. Before this, a failed
      // `startGame` (e.g. grid generation failed server-side) left
      // *no* visible chrome and was easy to mistake for the misleading
      // "Connexion perdue" banner that pops on a real transport drop.
      // The toast is intentionally less invasive than a banner: it
      // sits bottom-right, auto-dismisses, and does not push the lobby
      // content around.
      if (event.type === 'error') {
        // `invalid-pseudonym` renders next to the editor; the others
        // route through `setJoinDenied` and the redirect effect below
        // surfaces their own toast on the home page. Either way, this
        // generic toast path must not double-fire.
        const inlineHandled =
          event.errorType === 'https://bliss.example/errors/invalid-pseudonym' ||
          event.errorType === 'https://bliss.example/errors/wrong-code' ||
          isLobbyGoneFrame(event) ||
          (event.errorType === 'https://bliss.example/errors/protocol' &&
            !joinConfirmedRef.current);
        if (!inlineHandled) {
          showToast({
            text: messageForGameErrorEvent(event, { wasStarting: isStartingRef.current }),
            tone: 'error',
          });
        }
      }
      // ADR-0029: clear the rotation spinner on the refreshed `lobbyState`
      // (new `code`) or on any server `error` (defensive, e.g. not-owner).
      if ((event.type === 'lobbyState'
          && preRotationCodeRef.current != null
          && event.code !== preRotationCodeRef.current)
        || event.type === 'error') {
        setIsRotating(false);
        preRotationCodeRef.current = null;
      }
    });
    const unsubscribeConnection = gameClient.subscribeConnectionState((state) => {
      setConnectionState(state);
      // Toast is dispatched here, not in an effect, to fire in the same tick as the connection-state flip.
      if (state === 'connected') {
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          // show() replaces the sticky lost-toast (single-slot) and auto-dismisses; Toast owns its own aria-live region.
          showToast({ text: 'Connexion rétablie', tone: 'info' });
        }
        hasConnectedRef.current = true;
        return;
      }
      if (!hasConnectedRef.current || connectionLostRef.current) return;
      connectionLostRef.current = true;
      showToast({ text: 'Connexion perdue — reconnexion en cours…', tone: 'info', duration: null });
    });
    // ADR-0027: read the code stash the navigation populated. Read is
    // non-destructive so React StrictMode's mount-unmount-remount
    // cycle doesn't drain the stash on the first mount and starve the
    // second of its code. The stash is cleared on either confirmed
    // join (`playerJoined` for our sessionId) or wrong-code rejection
    // — see the subscribe handler above.
    const code = lobbyJoinCodeStash.read(lobbyId) ?? undefined;
    void gameClient.connect({ lobbyId, sessionId, pseudonym, code }).catch(() => {});
    return () => {
      unsubscribeEvents();
      unsubscribeConnection();
      gameClient.disconnect();
    };
  }, [gameClient, lobbyId, getSession, lobbyJoinCodeStash, showToast, announce]);

  // Honest 404 mid-game: stop retrying against a lobby the server says is gone, and drop the (now wrong) reconnection toast.
  useEffect(() => {
    if (!lobbyGone) return;
    dismissToast();
    gameClient.disconnect();
  }, [lobbyGone, gameClient, dismissToast]);

  // Bounce the user back to Accueil with an error toast when the WS
  // join was denied (wrong code, pre-join protocol error, etc.). The
  // redirect plus the gated render ensures the lobby content never
  // reaches a non-member's DOM.
  useEffect(() => {
    if (joinDenied == null) return;
    onJoinDenied(joinDenied);
  }, [joinDenied, onJoinDenied]);

  const { sessionId } = getSession();
  const lobby = view.lobby;

  // Announce multiplayer events to screen readers. Lives parallel to
  // the reducer subscription above so the announce path is independent
  // of the state-folding path. Local user's own join/leave events are
  // filtered by `multiAnnouncementFor` (returning null = no announce).
  useEffect(() => {
    const pseudonymBySessionId = new Map(
      lobby.players.map((p) => [p.sessionId, p.pseudonym] as const),
    );
    const ctx: MultiAnnounceContext = { localSessionId: sessionId, pseudonymBySessionId };
    const unsubscribe = gameClient.subscribe((event) => {
      const text = multiAnnouncementFor(event, ctx);
      if (text != null) announce(text);
    });
    return unsubscribe;
  }, [gameClient, sessionId, lobby.players, announce]);

  const rename = useCallback((newPseudonym: Pseudonym) => {
    // Server is authoritative; let playerRenamed persist to localStorage.
    gameClient.renameSelf(newPseudonym);
  }, [gameClient]);

  const setGridConfig = useCallback((width: number, height: number) => {
    gameClient.setGridConfig({ width, height });
  }, [gameClient]);

  const start = useCallback(() => {
    // Optimistic flip to the loading state — cleared either when the
    // server's `gameStarted` event arrives (via the subscribe handler)
    // or when an `error` frame surfaces a server-side rejection.
    setIsStarting(true);
    gameClient.startGame();
  }, [gameClient]);

  // ADR-0029: dispatch rotation; stash the pre-click code so the
  // subscribe handler can detect the refreshed snapshot.
  const rotateCode = useCallback(() => {
    preRotationCodeRef.current = view.lobby.code ?? null;
    setIsRotating(true);
    gameClient.rotateCode();
  }, [gameClient, view.lobby.code]);

  // ADR-0027: the address-bar URL is `/lobby/$lobbyId` and is NEVER a
  // share token (a viewer copying it cannot join — the WS rejects on
  // missing code). The share button copies a `/join/$code` link
  // instead; recipients clicking it land on the lobby with the code
  // already stashed, and the URL replaces back to `/lobby/$lobbyId`.
  const lobbyCode = lobby.code;
  const copyShareUrl = useCallback(async (): Promise<ShareInviteResult | null> => {
    if (lobbyCode == null) return null;
    const shareUrl = `${window.location.origin}/join/${lobbyCode}`;
    return shareOrCopyInviteUrl(shareUrl);
  }, [lobbyCode]);

  const leave = useCallback(() => {
    gameClient.leaveLobby();
  }, [gameClient]);

  const cellUpdate = useCallback((row: number, col: number, letter: string | null) => {
    // The Grid hook reports `string | null`; `cellUpdate` expects
    // `Letter | null`. The hook normalizes to a single uppercase letter
    // before firing `onCellChange` (see `useGridNavigation.handleInput`),
    // so the cast is sound — branded types only narrow at compile time.
    gameClient.cellUpdate(row, col, letter as Letter | null);
  }, [gameClient]);

  // Stable subscribe registrar for `Grid`'s `subscribeToRemoteCellUpdates`
  // prop. Filtering to `cellUpdated` lives inside Grid, so we hand it the
  // raw subscribe and let it discriminate.
  const subscribeToRemoteCellUpdates = useCallback(
    (handler: (event: GameEvent) => void) => gameClient.subscribe(handler),
    [gameClient],
  );

  // Local-user focus → outbound `cellFocus` frame. The hook fires this
  // synchronously on every focused-cell / direction transition; the
  // adapter's 200 ms debounce collapses bursts. `null` position means
  // the player has no cell focused. Stable reference so the hook's
  // option-stash ref doesn't churn.
  const cellFocus = useCallback(
    (position: Position | null, direction: 'across' | 'down' | null) => {
      gameClient.cellFocus(position?.row ?? null, position?.col ?? null, direction);
    },
    [gameClient],
  );

  // Snapshot presence ref. The reducer overwrites this on every
  // `lobbyState` event; the registrar below reads the latest value at
  // subscription time so the overlay receives a one-shot replay of
  // current cursors. Avoids re-subscribing when the snapshot changes
  // (which would tear down + re-mount the overlay's listener every time
  // a peer joined/left).
  const snapshotPresenceRef = useRef<readonly PresenceEntry[]>(
    initialLobby.game?.presence ?? [],
  );
  useEffect(() => {
    snapshotPresenceRef.current = view.lobby.game?.presence ?? [];
  }, [view.lobby.game?.presence]);

  // Stable subscribe registrar for `Grid`'s `subscribeToRemotePresence`
  // prop. On every fresh subscription: replay the current snapshot as
  // synthetic `presenceUpdated` events so a freshly-mounted overlay
  // paints immediately, then forward the raw stream (the overlay filters
  // to `presenceUpdated` internally). The replay fires synchronously so
  // the overlay's reducer sees the snapshot before any other render.
  const subscribeToRemotePresence = useCallback(
    (handler: (event: GameEvent) => void) => {
      for (const entry of snapshotPresenceRef.current) {
        handler({
          type: 'presenceUpdated',
          sessionId: entry.sessionId,
          row: entry.row,
          column: entry.column,
          direction: entry.direction,
        });
      }
      return gameClient.subscribe(handler);
    },
    [gameClient],
  );

  const closeModal = useCallback(() => {
    setView((current) => ({ ...current, modalDismissed: true }));
  }, []);

  // `GamePuzzle` (game/) ↔ `Puzzle` (puzzle/) shapes diverge; map at the
  // hook boundary so each context stays faithful to its wire shape.
  // Memoized on the puzzle ref so a steady-state render does not rebuild
  // the cell array.
  const gamePuzzle = lobby.game?.puzzle ?? null;
  const gridPuzzle = useMemo<Puzzle | null>(
    () => (gamePuzzle ? gamePuzzleToPuzzle(gamePuzzle) : null),
    [gamePuzzle],
  );
  // Stable reference for `Grid.initialEntries`: only re-computed when the
  // domain `entries` array reference changes (i.e. on `lobbyState` after
  // reconnect or on the loader's REST snapshot). The reducer leaves
  // `gameSession` untouched on `cellUpdated`, so the array stays stable
  // across keystrokes and a player's local typing is not wiped on every
  // re-render.
  const initialEntries = useMemo(
    () =>
      lobby.game?.entries.map((e) => ({
        row: e.row,
        column: e.column,
        letter: e.letter,
      })) ?? [],
    [lobby.game?.entries],
  );

  // Lookup table for the `<PresenceOverlay>` chip text. Re-derived only
  // when the players list reference changes (i.e. on join / leave /
  // rename). Keyed by sessionId because the overlay sees presences
  // identified by sessionId, not by index.
  const playersBySessionId = useMemo<ReadonlyMap<SessionId, Player>>(
    () => new Map(lobby.players.map((p) => [p.sessionId, p])),
    [lobby.players],
  );

  const actions = useMemo<LobbyActions>(
    () => ({
      rename,
      setGridConfig,
      start,
      rotateCode,
      copyShareUrl,
      leave,
      clearPseudonymError,
      closeModal,
      cellUpdate,
      cellFocus,
      subscribeToRemoteCellUpdates,
      subscribeToRemotePresence,
    }),
    [
      rename,
      setGridConfig,
      start,
      rotateCode,
      copyShareUrl,
      leave,
      clearPseudonymError,
      closeModal,
      cellUpdate,
      cellFocus,
      subscribeToRemoteCellUpdates,
      subscribeToRemotePresence,
    ],
  );

  return {
    view,
    connectionState,
    pseudonymError,
    joinDenied,
    joinConfirmed,
    lobbyGone,
    isStarting,
    isRotating,
    sessionId,
    gridPuzzle,
    initialEntries,
    playersBySessionId,
    actions,
  };
}

// French copy for a server `error` frame surfaced via the toast (i.e.
// not handled inline by the WaitingRoom pseudonym editor or the
// wrong-code join-denied banner). The server's `detail` is preferred
// when present — operators set it deliberately, and it carries the most
// specific context. When the frame arrives mid Start-game flow and ships
// no `detail`, the copy pins the error to the action the user just took.
export function messageForGameErrorEvent(
  event: { readonly detail?: string; readonly title: string },
  context: { readonly wasStarting: boolean },
): string {
  if (event.detail != null && event.detail.length > 0) return event.detail;
  // When the click that's in flight is a Démarrer, the start-specific
  // copy beats the server's title — it stays grounded in the action the
  // user just took, even if the server's title is more abstract.
  if (context.wasStarting) return 'Impossible de démarrer la partie. Réessayez.';
  // Otherwise prefer the server's `title`: backend error frames carry
  // French, context-specific titles which are strictly more useful than
  // the generic fallback. The fallback only kicks in for malformed /
  // blank-title frames.
  if (event.title.length > 0) return event.title;
  return 'Une erreur est survenue. Réessayez.';
}
