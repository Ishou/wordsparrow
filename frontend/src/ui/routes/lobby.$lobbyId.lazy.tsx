// Lazy half of `/lobby/$lobbyId`. The eager half (`./lobby.$lobbyId.tsx`)
// keeps the route definition, `head()`, and the loader (which runs
// without the lazy chunk loaded). Everything below — the WaitingRoom /
// Grid / EndGameModal state machine, the `GamePuzzle → Puzzle` adapter,
// the connection banner — moves into this chunk and only loads when a
// user actually navigates to the lobby.
//
// `Route.useLoaderData()`, `Route.useParams()`, and `Route.useRouteContext()`
// resolve correctly under the lazy split because `createLazyRoute('/lobby/$lobbyId')`
// matches the eager route's id 1:1 — the hooks the LazyRoute exposes are typed
// against that id.

import { createLazyRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';
import { LobbyClientError, type GameEvent } from '@/application/game';
import type { Position, Puzzle } from '@/domain';
import type {
  Lobby,
  LobbyId,
  Player,
  Position as GamePosition,
  SessionId,
} from '@/domain/game';
import { Grid } from '@/ui/components/grid';
import { usePresenceState } from '@/ui/components/grid/usePresenceState';
import { useTouchPrimary } from '@/ui/components/keyboard';
import {
  ContentPage,
  ProgressBar,
  PuzzleToolbar,
  ViewportPage,
} from '@/ui/components/layout';
import { ConnectionBanner } from '@/ui/components/lobby/ConnectionBanner';
import { EndGameModal } from '@/ui/components/lobby/EndGameModal';
import { PlayerList } from '@/ui/components/lobby/PlayerList';
import { WaitingRoom } from '@/ui/components/lobby/WaitingRoom';
import { useLobbyConnection } from '@/ui/components/lobby/useLobbyConnection';
import { Button, useToast } from '@/ui/components/primitives';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';

// Re-exported for `tests/lobby-multi-announce.test.tsx`, which imports
// the announce mapping from this route module. The logic now lives in
// `ui/components/lobby/lobbyEvents` and is shared with the hook.
export {
  type MultiAnnounceContext,
  multiAnnouncementFor,
} from '@/ui/components/lobby/lobbyEvents';

// Lighter charcoal panel behind the grid — same role-token + radius
// + padding as the solo route's panel.
const gridPanelStyles = css({
  width: '100%',
  flex: '1 1 0',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bg: 'surfaceElevated',
  borderRadius: '12px',
  padding: { base: '4px', md: '12px' },
  // Touch-primary: bleed past the page wrapper's 16 px horizontal padding so the grid hits viewport edges. Toolbar keeps its margin.
  '@media (any-pointer: coarse) and (any-hover: none)': {
    marginInline: '-16px',
    width: 'calc(100% + 32px)',
    borderRadius: 0,
  },
  // Large-desktop: break the grid panel out of the 720 px wrapper so gridShell sees the full viewport width.
  '@media (min-width: 768px) and (any-pointer: fine)': {
    marginInline: 'calc(50% - 50dvw)',
    width: '100dvw',
    borderRadius: 0,
  },
});

// Visually-hidden h1 for the heading-hierarchy contract — matches
// the solo route's pattern. The visible brand mark is the styled
// Lockup inside `AppHeader`.
const srOnly = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

const detailStyles = css({
  fontSize: 'body',
  margin: 0,
  color: 'accent',
  textAlign: 'center',
});

// Stack the alert copy on top of the back-home CTA so the user
// always has a one-click exit when the lobby fails to load.
const errorActionsStyles = css({
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'md',
});

// Per-phase shell choice (ADR-0036 §5):
//   - WAITING (and loading / error states) → ContentPage. WaitingRoom
//     is normal flow content with no `flex: 1` inner absorber, and the
//     status / error views are equally small. ContentPage's `flex: 1 0
//     auto` <main> grows to push the footer to the viewport bottom on
//     short content while never compressing tall content — fixes the
//     mobile footer-overlap bug where the WaitingRoom intrudes into
//     the footer's stacking position.
//   - IN_PROGRESS / COMPLETED → ViewportPage. The grid panel is the
//     `flex: 1` child that absorbs leftover viewport height; this is
//     the same chrome /grille uses.
const LobbyShell = ({
  variant,
  children,
}: {
  readonly variant: 'content' | 'viewport';
  readonly children: React.ReactNode;
}) => {
  const touchPrimary = useTouchPrimary();
  // Suppress native pinch on the viewport-variant <main> while the MobileKeyboard is mounted — ADR-0016 amendment 2026-05-22.
  if (variant === 'viewport') {
    return (
      <ViewportPage headerActiveNavId="grilles" suppressTouchAction={touchPrimary}>
        <h1 lang="en" className={srOnly}>
          WordSparrow
        </h1>
        {children}
      </ViewportPage>
    );
  }
  return (
    <ContentPage headerActiveNavId="grilles">
      <h1 lang="en" className={srOnly}>
        WordSparrow
      </h1>
      {children}
    </ContentPage>
  );
};

const LobbyStatus = ({ role, text }: { role: 'status' | 'alert'; text: string }) => (
  <LobbyShell variant="content">
    <p className={detailStyles} role={role}>{text}</p>
  </LobbyShell>
);

function LobbyPage() {
  const initialLobby = Route.useLoaderData() as Lobby;
  const { lobbyId } = Route.useParams();
  const ctx = Route.useRouteContext();
  // Multiplayer adapters are guaranteed present: the lobby route is
  // only registered when the multiplayer flag is on (see `router.ts`).
  const gameClient = ctx.gameClient!;
  const getSession = ctx.getSession!;
  const setPersistedPseudonym = ctx.setPseudonym;
  const lobbyJoinCodeStash = ctx.lobbyJoinCodeStash!;
  const navigate = useNavigate();
  // Destructure show/dismiss (not the wrapper object) — the object is recreated each render and would re-trigger the connection useEffect.
  const { show: showToast, dismiss: dismissToast } = useToast();
  const announcer = useAnnouncer();
  const { say: announce } = announcer;

  // `replace: true` keeps Accueil out of the back-stack so Back doesn't loop the denied joiner into the same denial.
  const onJoinDenied = useCallback(
    (message: string) => {
      showToast({ text: message, tone: 'error' });
      void navigate({ to: '/', replace: true });
    },
    [showToast, navigate],
  );

  const connection = useLobbyConnection({
    lobbyId: lobbyId as LobbyId,
    initialLobby,
    gameClient,
    getSession,
    setPersistedPseudonym,
    lobbyJoinCodeStash: {
      read: (id) => lobbyJoinCodeStash.read(id),
      clear: (id) => lobbyJoinCodeStash.clear(id),
    },
    showToast,
    dismissToast,
    announce,
    onJoinDenied,
  });

  const {
    view,
    connectionState,
    pseudonymError,
    joinDenied,
    joinConfirmed,
    isStarting,
    isRotating,
    sessionId,
    gridPuzzle,
    initialEntries,
    playersBySessionId,
    actions,
  } = connection;
  const lobby = view.lobby;

  const handlePlayAgain = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  // ADR-0036 §5: pick ViewportPage only once a `flex: 1` inner child
  // (the grid panel) is present to absorb leftover viewport height.
  // `lobby.game && gridPuzzle` gates that — until the puzzle is mapped
  // we stay in ContentPage even if the state has flipped, otherwise
  // there's a frame where <main> collapses to 0 with no absorber.
  const shellVariant: 'content' | 'viewport' =
    (lobby.state === 'IN_PROGRESS' || lobby.state === 'COMPLETED')
      && lobby.game != null
      && gridPuzzle != null
      ? 'viewport'
      : 'content';

  // Gate every lobby surface (WaitingRoom AND InGameView) on a
  // confirmed WS join. Until the server has accepted us, we show only
  // the connecting placeholder — even if the REST loader returned a
  // populated IN_PROGRESS snapshot, the grid stays hidden so a denied
  // joiner never sees the in-flight puzzle. `joinDenied != null` is
  // handled by the redirect effect above; this branch also covers the
  // tiny render between `setJoinDenied` and the navigate landing.
  if (!joinConfirmed || joinDenied != null) {
    return (
      <LobbyShell variant="content">
        <p
          role="status"
          className={css({ fontSize: 'body', color: 'fgMuted', textAlign: 'center', margin: 0, paddingBlock: 'md' })}
        >
          Connexion à la partie…
        </p>
      </LobbyShell>
    );
  }

  return (
    <>
      {/* Only terminal disconnect reaches here; transient states use the toast above. */}
      {connectionState === 'disconnected' ? (
        <ConnectionBanner state="disconnected" />
      ) : null}
      <LobbyShell variant={shellVariant}>
        {lobby.state === 'WAITING' ? (
          <>
            <p className={detailStyles}>
              {lobby.players.length} {lobby.players.length === 1 ? 'joueur' : 'joueurs'}
            </p>
            <WaitingRoom
              lobby={lobby}
              currentSessionId={sessionId}
              onRename={actions.rename}
              onSetGridConfig={actions.setGridConfig}
              onStart={actions.start}
              onCopyShareUrl={actions.copyShareUrl}
              pseudonymError={pseudonymError}
              onClearPseudonymError={actions.clearPseudonymError}
              isStarting={isStarting}
              onRotateCode={actions.rotateCode}
              isRotating={isRotating}
            />
          </>
        ) : null}

        {(lobby.state === 'IN_PROGRESS' || lobby.state === 'COMPLETED')
          && lobby.game
          && gridPuzzle ? (
          <InGameView
            puzzle={gridPuzzle}
            startedAt={lobby.game.startedAt}
            frozenAtMs={lobby.state === 'COMPLETED' ? view.durationMs ?? 0 : undefined}
            isCompleted={lobby.state === 'COMPLETED'}
            sessionId={sessionId}
            players={lobby.players}
            ownerSessionId={lobby.ownerSessionId}
            initialEntries={initialEntries}
            lockedPositions={lobby.game.lockedPositions ?? []}
            onCellChange={actions.cellUpdate}
            subscribeToRemoteCellUpdates={actions.subscribeToRemoteCellUpdates}
            onLocalFocusChange={actions.cellFocus}
            subscribeToRemotePresence={actions.subscribeToRemotePresence}
            playersBySessionId={playersBySessionId}
          />
        ) : null}
      </LobbyShell>

      {lobby.state === 'COMPLETED' && view.durationMs !== null && !view.modalDismissed ? (
        <EndGameModal
          durationMs={view.durationMs}
          onPlayAgain={handlePlayAgain}
          onClose={actions.closeModal}
        />
      ) : null}
    </>
  );
}

// In-game view shared by `IN_PROGRESS` and `COMPLETED`. Mirrors the
// solo route's chrome (player roster + toolbar → grid panel) but
// drops the local validation flow: per AsyncAPI's `GameLetterCell`,
// the server intentionally omits the canonical answer from every
// puzzle frame (it would let any client cheat). `useValidation`
// would therefore see `cell.answer === undefined` everywhere and
// silently no-op — leaving Vérifier + progress as broken affordances.
//
// Authoritative win = the server's `gameSolved` event. When that
// arrives the route flips `isCompleted` and we paint EVERY letter
// cell validated so the grid lights up sage to match the modal.
interface InGameViewProps {
  readonly puzzle: Puzzle;
  readonly startedAt: string;
  readonly frozenAtMs?: number;
  readonly isCompleted: boolean;
  readonly sessionId: SessionId;
  readonly players: Lobby['players'];
  readonly ownerSessionId: SessionId;
  readonly initialEntries: ReadonlyArray<{ row: number; column: number; letter: string }>;
  readonly lockedPositions: ReadonlyArray<GamePosition>;
  readonly onCellChange: (row: number, col: number, letter: string | null) => void;
  readonly subscribeToRemoteCellUpdates: (handler: (event: GameEvent) => void) => () => void;
  readonly onLocalFocusChange: (
    position: Position | null,
    direction: 'across' | 'down' | null,
  ) => void;
  readonly subscribeToRemotePresence: (handler: (event: GameEvent) => void) => () => void;
  readonly playersBySessionId: ReadonlyMap<SessionId, Player>;
}

function InGameView({
  puzzle,
  startedAt,
  frozenAtMs,
  isCompleted,
  sessionId,
  players,
  ownerSessionId,
  initialEntries,
  lockedPositions,
  onCellChange,
  subscribeToRemoteCellUpdates,
  onLocalFocusChange,
  subscribeToRemotePresence,
  playersBySessionId,
}: InGameViewProps) {
  // Auto-locked cells from server `wordLocked` events (and the snapshot
  // seed for late joiners) merged with the COMPLETED-end-game cue: when
  // `gameSolved` arrives the entire grid is correct by definition (the
  // server wouldn't have fired the event otherwise) and we paint every
  // letter cell validated. Until then, only the per-word locks are sage.
  const validatedPositions = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    for (const p of lockedPositions) set.add(`${p.row},${p.column}`);
    if (isCompleted) {
      for (const cell of puzzle.cells) {
        if (cell.kind === 'letter') {
          set.add(`${cell.position.row},${cell.position.col}`);
        }
      }
    }
    return set;
  }, [isCompleted, lockedPositions, puzzle.cells]);

  // Same progress bar as solo: count of locked cells over total letter
  // cells. The denominator is fixed per puzzle; the numerator grows as
  // `wordLocked` events arrive (and jumps to total on `gameSolved`).
  const totalLetterCells = useMemo<number>(
    () => puzzle.cells.reduce((n, c) => (c.kind === 'letter' ? n + 1 : n), 0),
    [puzzle.cells],
  );

  // Updated via local onCellChange wrapper and remote cellUpdated events.
  const [filledPositions, setFilledPositions] = useState<ReadonlySet<string>>(
    () => new Set(initialEntries.map((e) => `${e.row},${e.column}`)),
  );
  useEffect(() => {
    setFilledPositions(new Set(initialEntries.map((e) => `${e.row},${e.column}`)));
  }, [initialEntries]);
  useEffect(() => {
    const unsubscribe = subscribeToRemoteCellUpdates((event) => {
      if (event.type !== 'cellUpdated') return;
      const key = `${event.row},${event.column}`;
      setFilledPositions((prev) => {
        if (event.letter === null) {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        }
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    });
    return unsubscribe;
  }, [subscribeToRemoteCellUpdates]);

  // Wraps onCellChange so local writes mirror into filledPositions.
  const handleLocalCellChange = useCallback(
    (row: number, col: number, letter: string | null) => {
      onCellChange(row, col, letter);
      const key = `${row},${col}`;
      setFilledPositions((prev) => {
        if (letter === null) {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        }
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [onCellChange],
  );

  // Pending = filled ∖ validated (set difference, not size subtraction).
  const pending = useMemo(() => {
    let count = 0;
    for (const k of filledPositions) if (!validatedPositions.has(k)) count++;
    return count;
  }, [filledPositions, validatedPositions]);

  // Multiplayer presence-state derived from the typing / idle /
  // connectionLost / presenceUpdated event stream. One subscription owns
  // the aggregation; both the roster pill (`typingSessionIds` /
  // `idleSessionIds` / `disconnectingSessionIds`) and the grid (which
  // merges typing into per-cell badges) consume the same map.
  const presenceState = usePresenceState(subscribeToRemotePresence, sessionId);
  const typingSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) {
      if (st.typing) set.add(sid);
    }
    return set;
  }, [presenceState]);
  const idleSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) {
      if (st.idle) set.add(sid);
    }
    return set;
  }, [presenceState]);
  const disconnectingSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) {
      if (st.connectionLost) set.add(sid);
    }
    return set;
  }, [presenceState]);

  return (
    <>
      <PlayerList
        players={players}
        ownerSessionId={ownerSessionId}
        currentSessionId={sessionId}
        variant="inline"
        typingSessionIds={typingSessionIds}
        idleSessionIds={idleSessionIds}
        disconnectingSessionIds={disconnectingSessionIds}
      />
      <PuzzleToolbar
        metadata={`Partie multijoueur · ${players.length} ${players.length === 1 ? 'joueur' : 'joueurs'}`}
        timerStartedAt={startedAt}
        timerFrozenAtMs={frozenAtMs}
      />
      <div className={gridPanelStyles}>
        <Grid
          puzzle={puzzle}
          validatedPositions={validatedPositions}
          onCellChange={isCompleted ? undefined : handleLocalCellChange}
          subscribeToRemoteCellUpdates={subscribeToRemoteCellUpdates}
          initialEntries={initialEntries}
          onLocalFocusChange={isCompleted ? undefined : onLocalFocusChange}
          subscribeToRemotePresence={subscribeToRemotePresence}
          playersBySessionId={playersBySessionId}
          currentSessionId={sessionId}
          typingSessionIds={typingSessionIds}
        />
      </div>
      <ProgressBar
        value={validatedPositions.size}
        total={totalLetterCells}
        pending={pending}
      />
    </>
  );
}
// Both "Salon introuvable" and "Serveur indisponible" leave the user
// stranded on a page that cannot recover on its own — the lobby id is
// either gone for good or the upstream is down. Surface a primary CTA
// that drops them back on `/` so they can spin up a new lobby (or join
// another one). Uses `useNavigate` + a `Button` rather than a TanStack
// `<Link>` because the visual treatment matches the rest of the app's
// CTAs (solid primary `Button`); a text link would read as secondary.
function BackHomeButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="primary"
      onClick={() => { void navigate({ to: '/' }); }}
    >
      Retour à l&apos;accueil
    </Button>
  );
}

function LobbyErrorWithBackHome({ text }: { text: string }) {
  return (
    <LobbyShell variant="content">
      <div className={errorActionsStyles}>
        <p className={detailStyles} role="alert">{text}</p>
        <BackHomeButton />
      </div>
    </LobbyShell>
  );
}
function LobbyErrorComponent({ error }: { error: Error }) {
  if (error instanceof LobbyClientError) {
    switch (error.kind) {
      case 'not-found':
        return <LobbyErrorWithBackHome text="Salon introuvable." />;
      case 'upstream-unavailable':
        return <LobbyErrorWithBackHome text="Serveur indisponible. Réessayez dans un instant." />;
      case 'validation':
      case 'transient':
        return <LobbyStatus role="alert" text="Une erreur est survenue. Réessayez." />;
    }
  }
  // Unknown error — surface to the browser console so the user (or CI
  // logs) can see the underlying cause when the generic copy is shown.
  // The fallback UI stays vague-on-purpose: the user is not equipped
  // to act on a TypeError or a parser mismatch, but a developer
  // reading devtools should be able to.
  console.error('LobbyErrorComponent: unexpected error', error);
  return <LobbyStatus role="alert" text="Une erreur est survenue. Réessayez." />;
}

export const Route = createLazyRoute('/lobby/$lobbyId')({
  component: LobbyPage,
  pendingComponent: () => <LobbyStatus role="status" text="Chargement du salon…" />,
  errorComponent: LobbyErrorComponent,
});
