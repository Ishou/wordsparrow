// Multiplayer-gated `/join/$code` share-link landing (ADR-0018 §10).

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LobbyClientError } from '@/application/game';
import type { Lobby, LobbyId } from '@/domain/game';
import { LOBBY_CODE_PATTERN } from '@/domain/game/lobbyCode';
import { createLoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';
import { LoaderRetry } from '@/ui/v2/LoaderRetry';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { SparrowState } from '@/ui/v2/SparrowState';
import { sparrowFlightScene } from '@/ui/v2/SparrowScenes';
import { css } from 'styled-system/css';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

const message = css({
  fontFamily: 'wsUi',
  fontSize: '17px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textAlign: 'center',
  marginTop: '40px',
});
// Survives the errorComponent's remount-per-attempt so the ladder progresses.
export const joinLoaderRetryPolicy = createLoaderRetryPolicy();

function V2JoinRedirect() {
  const lobby = Route.useLoaderData() as Lobby & { readonly id: LobbyId };
  const { code } = Route.useParams();
  const ctx = Route.useRouteContext();
  // Registered only under the multiplayer flag, so the stash adapter is present (same posture as the prod join route).
  const lobbyJoinCodeStash = ctx.lobbyJoinCodeStash!;
  const navigate = useNavigate();

  // One-shot after paint: stash the code so the lobby route's WS-open consumes it, then replace the URL.
  useEffect(() => {
    joinLoaderRetryPolicy.reset();
    lobbyJoinCodeStash.stash(lobby.id, code);
    void navigate({ to: '/lobby/$lobbyId', params: { lobbyId: lobby.id }, replace: true });
  }, [code, lobby.id, lobbyJoinCodeStash, navigate]);

  return (
    <PhoneShell header={<BackHeader to="/" />}>
      <p className={message} role="status">Connexion à la partie…</p>
    </PhoneShell>
  );
}

// Tags the parse-time malformed-code reject so the boundary maps it without reading `error.message` (lint-forbidden).
class MalformedCodeError extends Error {
  readonly malformedCode = true;
}

function V2JoinError({ error }: { readonly error: Error }) {
  const navigate = useNavigate();
  // Bad/expired code surfaces two ways: our parse-time reject (TanStack preserves it as `cause`) or a not-found findByCode.
  const badCode =
    error.cause instanceof MalformedCodeError ||
    (error instanceof LobbyClientError && error.kind === 'not-found');
  if (!badCode) {
    // Transient / upstream failure — auto-retry; never claim the code is bad.
    return <LoaderRetry policy={joinLoaderRetryPolicy} silentText="Recherche de la partie…" />;
  }
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene()}
        title="Partie introuvable"
        body="Code invalide ou partie expirée."
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/' }) }}
      />
    </PhoneShell>
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'join/$code',
  parseParams: (raw) => {
    const code = String(raw.code ?? '').toUpperCase();
    // Reject at parse-time so a malformed code renders the error boundary without a wasted `findByCode`.
    if (!LOBBY_CODE_PATTERN.test(code)) {
      throw new MalformedCodeError('Code invalide ou partie expirée.');
    }
    return { code };
  },
  loader: ({ context, params }): Promise<Lobby & { readonly id: LobbyId }> =>
    context.lobbyClient!.findByCode(params.code),
  component: V2JoinRedirect,
  errorComponent: V2JoinError,
  pendingComponent: () => (
    <PhoneShell header={<BackHeader to="/" />}>
      <p className={message} role="status">Recherche de la partie…</p>
    </PhoneShell>
  ),
  head: () => noindexHead('Rejoindre une partie — WordSparrow', 'Rejoins une partie de mots fléchés.'),
});
