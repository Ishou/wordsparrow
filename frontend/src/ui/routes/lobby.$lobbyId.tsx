// Multiplayer-gated `/lobby/$lobbyId` (ADR-0018 §10); smart container over `useLobbyConnection`.

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LobbyClientError } from '@/application/game';
import type { Lobby, LobbyId, Pseudonym } from '@/domain/game';
import { createLoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';
import { LoaderRetry } from '@/ui/v2/LoaderRetry';
import { useOptionalAuth } from '@/ui/components/auth';
import { useLobbyConnection } from '@/ui/components/lobby/useLobbyConnection';
import { withLocalPlayer } from '@/ui/components/lobby/lobbyView';
import { useCountdownTicker } from '@/ui/components/grid';
import { HostSignInSheet } from '@/ui/home/HostSignInSheet';
import { useToast } from '@/ui/components/primitives';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { AppShell } from '@/ui/v2/AppShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { SparrowState } from '@/ui/v2/SparrowState';
import { sparrowFlightScene } from '@/ui/v2/SparrowScenes';
import { SalonScreen } from '@/ui/v2/multiplayer/SalonScreen';
import { LiveCoopScreen } from '@/ui/v2/multiplayer/LiveCoopScreen';
import { useCoopWinCue } from '@/ui/v2/multiplayer/useCoopWinCue';
import { ResultatsScreen } from '@/ui/v2/multiplayer/ResultatsScreen';
import { css } from 'styled-system/css';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

// ADR-0113: the server auto-restarts a completed co-op game after this delay; the win-screen countdown mirrors it cosmetically.
const REMATCH_AUTO_START_SECONDS = 10;

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
    <AppShell variant="flow" topBar={<BackHeader to="/" />}>
      <p className={placeholder} role="status">{text}</p>
    </AppShell>
  );
}

// Headerless SparrowState matching the 404 error pattern; CTA handles navigation.
function V2LobbyIntrouvable() {
  const navigate = useNavigate();
  return (
    <AppShell variant="flow">
      <SparrowState
        scene={sparrowFlightScene()}
        title={t('route.lobby.introuvable.title')}
        body={t('route.lobby.introuvable.body')}
        cta={{ label: t('route.lobby.introuvable.cta'), onClick: () => void navigate({ to: '/' }) }}
      />
    </AppShell>
  );
}

// ADR-0018 §5 accepted gap: a rejoin denied after the server's 30s grace freed the seat lands here.
function V2LobbyEvicted() {
  const navigate = useNavigate();
  return (
    <AppShell variant="flow">
      <SparrowState
        scene={sparrowFlightScene()}
        title={t('route.lobby.evicted.title')}
        body={t('route.lobby.evicted.body')}
        cta={{ label: t('route.lobby.evicted.cta'), onClick: () => void navigate({ to: '/' }) }}
      />
    </AppShell>
  );
}

// Survives the errorComponent's remount-per-attempt so the ladder progresses.
export const lobbyLoaderRetryPolicy = createLoaderRetryPolicy();

// getLobby rejection boundary — « introuvable » only on a server-confirmed 404; anything transient auto-retries.
function V2LobbyError({ error }: { readonly error: Error }) {
  const notFound = error instanceof LobbyClientError && error.kind === 'not-found';
  if (notFound) return <V2LobbyIntrouvable />;
  return <LoaderRetry policy={lobbyLoaderRetryPolicy} silentText={t('route.lobby.placeholder.loading')} />;
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
  const auth = useOptionalAuth();
  const [hostSignInOpen, setHostSignInOpen] = useState(false);
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
    evicted,
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

  // An authed user's real seat carries their account name (server-verified), so the synthesized fallback must too — otherwise a reconnect snapshot gap flashes the local guest pseudonym (ADR-0066 (d) amendment).
  const localPseudonym =
    auth?.state.status === 'authed' ? (auth.state.whoami.displayName as Pseudonym) : getSession().pseudonym;

  // Guarantee the local player's seat in the roster so their own pseudonym never blanks on rejoin (see withLocalPlayer / ADR-0018 §5).
  const rosterPlayers = useMemo(
    () => withLocalPlayer(lobby.players, sessionId, localPseudonym),
    [lobby.players, sessionId, localPseudonym],
  );

  // Coop win cue on the live IN_PROGRESS→COMPLETED transition (the screen unmounts into Résultats).
  useCoopWinCue(lobby.state, ctx.soundPlayer);

  const handleLeave = useCallback(() => {
    actions.leave();
    void navigate({ to: '/' });
  }, [actions, navigate]);

  // ADR-0098 §2: navigating away from an in-progress game must NOT relinquish — just leave the view and let unmount `disconnect()` (grace, keeps ownership). Only an explicit Quitter relinquishes.
  const handleLeaveGame = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  // ADR-0113: seed the cosmetic countdown once from the server `completedAt`; the ticker counts down 1 Hz while the server-side timer drives the real restart.
  const completedAt = lobby.game?.completedAt ?? null;
  const [rematchSeed, setRematchSeed] = useState<number | null>(null);
  useEffect(() => {
    const completedMs = completedAt != null ? Date.parse(completedAt) : NaN;
    if (!Number.isFinite(completedMs)) {
      setRematchSeed(null);
      return;
    }
    setRematchSeed(Math.max(0, REMATCH_AUTO_START_SECONDS - Math.floor((Date.now() - completedMs) / 1000)));
  }, [completedAt]);
  const secondsUntilRematch = useCountdownTicker(rematchSeed);
  const isHost = sessionId === lobby.ownerSessionId;

  const handleHome = useCallback(() => {
    actions.leave();
    void navigate({ to: '/' });
  }, [actions, navigate]);

  // ADR-0098 §6 / ADR-0083: claiming needs an account, so a guest is prompted to sign in first (mirrors the create-coop gate — playing stays open); a signed-in claim hits the endpoint and a 403/409 surfaces a toast.
  const handleClaim = useCallback(async () => {
    if (auth?.state.status === 'anon') {
      setHostSignInOpen(true);
      return;
    }
    try {
      await lobbyClient.claimOwnership(lobbyId as LobbyId);
    } catch {
      showToast({ text: t('route.lobby.error.cannotClaim'), tone: 'error' });
    }
  }, [auth, lobbyClient, lobbyId, showToast]);

  // The only involuntary exits from the game surface: server-confirmed 404 or a freed seat (honest states).
  if (lobbyGone) {
    return <V2LobbyIntrouvable />;
  }

  if (evicted) {
    return <V2LobbyEvicted />;
  }

  if (!joinConfirmed || joinDenied != null) {
    return <V2LobbyPlaceholder text={t('route.lobby.placeholder.connecting')} />;
  }

  if (lobby.state === 'WAITING') {
    return (
      <SalonScreen
        lobby={{ ...lobby, players: rosterPlayers }}
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
      <>
        <LiveCoopScreen
          puzzle={gridPuzzle}
          startedAt={lobby.game.startedAt}
          isCompleted={false}
          sessionId={sessionId}
          players={rosterPlayers}
          playersBySessionId={playersBySessionId}
          initialEntries={initialEntries}
          lockedPositions={lobby.game.lockedPositions ?? []}
          onCellChange={actions.cellUpdate}
          onLocalFocusChange={actions.cellFocus}
          subscribeToRemoteCellUpdates={actions.subscribeToRemoteCellUpdates}
          subscribeToRemotePresence={actions.subscribeToRemotePresence}
          onLeave={handleLeaveGame}
          ownerless={lobby.ownerless}
          onClaim={handleClaim}
          soundPlayer={ctx.soundPlayer}
          soundStore={ctx.soundStore}
          skipFilledStore={ctx.skipFilledStore}
          surveyClient={ctx.surveyClient}
        />
        <HostSignInSheet open={hostSignInOpen} authClient={ctx.authClient} onClose={() => setHostSignInOpen(false)} />
      </>
    );
  }

  // COMPLETED co-op finish — the frozen grid is left behind; Résultats is the destination.
  if (lobby.state === 'COMPLETED') {
    return (
      <AppShell variant="flow" topBar={<BackHeader to="/" />}>
        <ResultatsScreen
          durationMs={view.durationMs ?? 0}
          players={rosterPlayers}
          ownerSessionId={lobby.ownerSessionId}
          lockedPositions={lobby.game?.lockedPositions ?? []}
          secondsUntilRematch={secondsUntilRematch}
          isHost={isHost}
          onRematchNow={actions.rematch}
          onCancelRematch={actions.returnToSalon}
          onHome={handleHome}
        />
      </AppShell>
    );
  }
  return <V2LobbyPlaceholder text={t('route.lobby.placeholder.inProgress')} />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'lobby/$lobbyId',
  // `blocking` staleReloadMode: on re-entry the router must re-fetch and show the pendingComponent, not paint a cached WAITING snapshot before revalidating to IN_PROGRESS (resume flash).
  loader: {
    staleReloadMode: 'blocking',
    handler: ({ context, params }): Promise<Lobby> =>
      // Asserted non-null: registered only when the multiplayer flag is on, so the composition root guarantees `lobbyClient`.
      context.lobbyClient!.getLobby(params.lobbyId as LobbyId),
  },
  component: V2LobbyPage,
  pendingComponent: () => <V2LobbyPlaceholder text={t('route.lobby.placeholder.loading')} />,
  pendingMs: 0,
  errorComponent: V2LobbyError,
  head: () => noindexHead(t('seo.shell.lobby.title'), t('seo.shell.lobby.description')),
});
