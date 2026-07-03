// Multiplayer-gated `/lobby/$lobbyId` (ADR-0018 §10); smart container over `useLobbyConnection`.

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { LobbyClientError } from '@/application/game';
import type { Lobby, LobbyId } from '@/domain/game';
import { createLoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';
import { LoaderRetry } from '@/ui/v2/LoaderRetry';
import { useLobbyConnection } from '@/ui/components/lobby/useLobbyConnection';
import { useToast } from '@/ui/components/primitives';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { SparrowState } from '@/ui/v2/SparrowState';
import { sparrowFlightScene } from '@/ui/v2/SparrowScenes';
import { SalonScreen } from '@/ui/v2/multiplayer/SalonScreen';
import { LiveCoopScreen } from '@/ui/v2/multiplayer/LiveCoopScreen';
import { ResultatsScreen } from '@/ui/v2/multiplayer/ResultatsScreen';
import { css } from 'styled-system/css';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

const placeholder = css({
  fontFamily: 'wsUi',
  fontSize: '17px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textAlign: 'center',
  marginTop: '40px',
});

function V2LobbyPlaceholder({ text }: { readonly text: string }) {
  return (
    <PhoneShell header={<BackHeader to="/" />}>
      <p className={placeholder} role="status">{text}</p>
    </PhoneShell>
  );
}

// Headerless SparrowState matching the 404 error pattern; CTA handles navigation.
function V2LobbyIntrouvable() {
  const navigate = useNavigate();
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene()}
        title="Partie introuvable"
        body={"Cette partie n'existe plus ou le lien a expiré."}
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/' }) }}
      />
    </PhoneShell>
  );
}

// Survives the errorComponent's remount-per-attempt so the ladder progresses.
export const lobbyLoaderRetryPolicy = createLoaderRetryPolicy();

// getLobby rejection boundary — « introuvable » only on a server-confirmed
// 404; anything transient auto-retries instead of claiming the game is gone.
function V2LobbyError({ error }: { readonly error: Error }) {
  const notFound = error instanceof LobbyClientError && error.kind === 'not-found';
  if (notFound) return <V2LobbyIntrouvable />;
  return <LoaderRetry policy={lobbyLoaderRetryPolicy} silentText="Chargement de la partie…" />;
}

function V2LobbyPage() {
  const initialLobby = Route.useLoaderData() as Lobby;
  const { lobbyId } = Route.useParams();
  const ctx = Route.useRouteContext();
  // Multiplayer adapters are guaranteed present: the route is registered only when the flag is on.
  const gameClient = ctx.gameClient!;
  const getSession = ctx.getSession!;
  const setPersistedPseudonym = ctx.setPseudonym;
  const lobbyJoinCodeStash = ctx.lobbyJoinCodeStash!;
  const lobbyClient = ctx.lobbyClient!;
  const navigate = useNavigate();
  const [isReplaying, setIsReplaying] = useState(false);
  // Destructure show/dismiss (not the wrapper object) — the object is recreated each render and would re-trigger the connection effect.
  const { show: showToast, dismiss: dismissToast } = useToast();
  const { say: announce } = useAnnouncer();

  const onJoinDenied = useCallback(
    (message: string) => {
      showToast({ text: message, tone: 'error' });
      void navigate({ to: '/', replace: true });
    },
    [showToast, navigate],
  );

  // Loader succeeded — restore the full auto-retry budget for the next incident.
  useEffect(() => {
    lobbyLoaderRetryPolicy.reset();
  }, []);

  const {
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
  } = useLobbyConnection({
    lobbyId: lobbyId as LobbyId,
    initialLobby,
    gameClient,
    getSession,
    setPersistedPseudonym,
    lobbyJoinCodeStash,
    showToast,
    dismissToast,
    announce,
    onJoinDenied,
  });

  const lobby = view.lobby;

  const handleLeave = useCallback(() => {
    actions.leave();
    void navigate({ to: '/' });
  }, [actions, navigate]);

  const handleReplay = useCallback(() => {
    setIsReplaying(true);
    const { sessionId: ownerSessionId, pseudonym: ownerPseudonym } = getSession();
    lobbyClient
      .createLobby({ ownerSessionId, ownerPseudonym })
      .then((created) =>
        navigate({ to: '/lobby/$lobbyId', params: { lobbyId: created.id } }),
      )
      .catch(() => {
        setIsReplaying(false);
        showToast({ text: 'Impossible de créer une partie. Réessaie.', tone: 'error' });
      });
  }, [getSession, lobbyClient, navigate, showToast]);

  const handleHome = useCallback(() => {
    actions.leave();
    void navigate({ to: '/' });
  }, [actions, navigate]);

  // Server-confirmed 404 mid-game (rejoin against a wiped lobby) — the only
  // involuntary path that leaves the game surface (spec: honest 404s).
  if (lobbyGone) {
    return <V2LobbyIntrouvable />;
  }

  if (!joinConfirmed || joinDenied != null) {
    return <V2LobbyPlaceholder text="Connexion à la partie…" />;
  }

  if (lobby.state === 'WAITING') {
    return (
      <SalonScreen
        lobby={lobby}
        sessionId={sessionId}
        connectionState={connectionState}
        pseudonymError={pseudonymError}
        isStarting={isStarting}
        isRotating={isRotating}
        onRename={actions.rename}
        onSetGridConfig={actions.setGridConfig}
        onStart={actions.start}
        onRotateCode={actions.rotateCode}
        onCopyShareUrl={actions.copyShareUrl}
        onLeave={handleLeave}
        onClearPseudonymError={actions.clearPseudonymError}
      />
    );
  }

  if (lobby.state === 'IN_PROGRESS' && lobby.game && gridPuzzle) {
    return (
      <LiveCoopScreen
        puzzle={gridPuzzle}
        startedAt={lobby.game.startedAt}
        isCompleted={false}
        sessionId={sessionId}
        players={lobby.players}
        playersBySessionId={playersBySessionId}
        initialEntries={initialEntries}
        lockedPositions={lobby.game.lockedPositions ?? []}
        onCellChange={actions.cellUpdate}
        onLocalFocusChange={actions.cellFocus}
        subscribeToRemoteCellUpdates={actions.subscribeToRemoteCellUpdates}
        subscribeToRemotePresence={actions.subscribeToRemotePresence}
        onLeave={handleLeave}
      />
    );
  }

  // COMPLETED co-op finish — the frozen grid is left behind; Résultats is the destination.
  if (lobby.state === 'COMPLETED') {
    return (
      <PhoneShell header={<BackHeader to="/" />}>
        <ResultatsScreen
          durationMs={view.durationMs ?? 0}
          players={lobby.players}
          ownerSessionId={lobby.ownerSessionId}
          isReplaying={isReplaying}
          onReplay={handleReplay}
          onHome={handleHome}
        />
      </PhoneShell>
    );
  }
  return <V2LobbyPlaceholder text="La partie est en cours…" />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'lobby/$lobbyId',
  loader: ({ context, params }): Promise<Lobby> =>
    // Asserted non-null: registered only when the multiplayer flag is on, so the composition root guarantees `lobbyClient`.
    context.lobbyClient!.getLobby(params.lobbyId as LobbyId),
  component: V2LobbyPage,
  pendingComponent: () => <V2LobbyPlaceholder text="Chargement de la partie…" />,
  pendingMs: 0,
  errorComponent: V2LobbyError,
  head: () => noindexHead('Partie — WordSparrow', 'Partie de mots fléchés en multijoueur.'),
});
