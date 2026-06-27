// DEV+multiplayer-gated v2 reskin (ADR-0072) of `/lobby/$lobbyId`; smart container over `useLobbyConnection`.

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import type { Lobby, LobbyId } from '@/domain/game';
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
import { Route as V2Route } from './v2';

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
    <PhoneShell header={<BackHeader to="/v2" />}>
      <p className={placeholder} role="status">{text}</p>
    </PhoneShell>
  );
}

// getLobby rejection boundary — headerless SparrowState matching the 404 error pattern; CTA handles navigation
function V2LobbyError() {
  const navigate = useNavigate();
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene()}
        title="Partie introuvable"
        body={"Cette partie n'existe plus ou le lien a expiré."}
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/v2' }) }}
      />
    </PhoneShell>
  );
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
      void navigate({ to: '/v2', replace: true });
    },
    [showToast, navigate],
  );

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
    void navigate({ to: '/v2' });
  }, [actions, navigate]);

  const handleReplay = useCallback(() => {
    setIsReplaying(true);
    const { sessionId: ownerSessionId, pseudonym: ownerPseudonym } = getSession();
    lobbyClient
      .createLobby({ ownerSessionId, ownerPseudonym })
      .then((created) =>
        navigate({ to: '/v2/lobby/$lobbyId', params: { lobbyId: created.id } }),
      )
      .catch(() => {
        setIsReplaying(false);
        showToast({ text: 'Impossible de créer une partie. Réessaie.', tone: 'error' });
      });
  }, [getSession, lobbyClient, navigate, showToast]);

  const handleHome = useCallback(() => {
    actions.leave();
    void navigate({ to: '/v2' });
  }, [actions, navigate]);

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
      <PhoneShell header={<BackHeader to="/v2" />}>
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
  getParentRoute: () => V2Route,
  path: 'lobby/$lobbyId',
  loader: ({ context, params }): Promise<Lobby> =>
    // Asserted non-null: registered only when the multiplayer flag is on, so the composition root guarantees `lobbyClient`.
    context.lobbyClient!.getLobby(params.lobbyId as LobbyId),
  component: V2LobbyPage,
  pendingComponent: () => <V2LobbyPlaceholder text="Chargement de la partie…" />,
  errorComponent: V2LobbyError,
});
