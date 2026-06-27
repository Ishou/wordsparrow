// DEV+multiplayer-gated v2 reskin (ADR-0072) of `/lobby/$lobbyId`; smart container over `useLobbyConnection`.

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import type { Lobby, LobbyId } from '@/domain/game';
import { useLobbyConnection } from '@/ui/components/lobby/useLobbyConnection';
import { useToast } from '@/ui/components/primitives';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { SalonScreen } from '@/ui/v2/multiplayer/SalonScreen';
import { LiveCoopScreen } from '@/ui/v2/multiplayer/LiveCoopScreen';
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
    <PhoneShell header={<BackHeader to="/v2/home" />}>
      <p className={placeholder} role="status">{text}</p>
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
  const navigate = useNavigate();
  // Destructure show/dismiss (not the wrapper object) — the object is recreated each render and would re-trigger the connection effect.
  const { show: showToast, dismiss: dismissToast } = useToast();
  const { say: announce } = useAnnouncer();

  const onJoinDenied = useCallback(
    (message: string) => {
      showToast({ text: message, tone: 'error' });
      void navigate({ to: '/v2/home', replace: true });
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
    void navigate({ to: '/v2/home' });
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

  if (
    (lobby.state === 'IN_PROGRESS' || lobby.state === 'COMPLETED') &&
    lobby.game &&
    gridPuzzle
  ) {
    return (
      <LiveCoopScreen
        puzzle={gridPuzzle}
        startedAt={lobby.game.startedAt}
        frozenAtMs={lobby.state === 'COMPLETED' ? view.durationMs ?? 0 : undefined}
        isCompleted={lobby.state === 'COMPLETED'}
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

  // COMPLETED with no mapped game snapshot → W4 builds Résultats.
  if (lobby.state === 'COMPLETED') {
    return <V2LobbyPlaceholder text="Partie terminée." />;
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
  pendingComponent: () => <V2LobbyPlaceholder text="Chargement du salon…" />,
});
