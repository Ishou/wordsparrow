// DEV+multiplayer-gated v2 share-link landing (ADR-0072 reskin of `/join/$code`).

import { createRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LobbyClientError } from '@/application/game';
import type { Lobby, LobbyId } from '@/domain/game';
import { LOBBY_CODE_PATTERN } from '@/domain/game/lobbyCode';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { SparrowState } from '@/ui/v2/SparrowState';
import { sparrowFlightScene } from '@/ui/v2/SparrowScenes';
import { css } from 'styled-system/css';
import { Route as V2Route } from './v2';

const message = css({
  fontFamily: 'wsUi',
  fontSize: '17px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textAlign: 'center',
  marginTop: '40px',
});
function V2JoinRedirect() {
  const lobby = Route.useLoaderData() as Lobby & { readonly id: LobbyId };
  const { code } = Route.useParams();
  const ctx = Route.useRouteContext();
  // Registered only under the multiplayer flag, so the stash adapter is present (same posture as the prod join route).
  const lobbyJoinCodeStash = ctx.lobbyJoinCodeStash!;
  const navigate = useNavigate();

  // One-shot after paint: stash the code so the lobby route's WS-open consumes it, then replace the URL.
  useEffect(() => {
    lobbyJoinCodeStash.stash(lobby.id, code);
    void navigate({ to: '/v2/lobby/$lobbyId', params: { lobbyId: lobby.id }, replace: true });
  }, [code, lobby.id, lobbyJoinCodeStash, navigate]);

  return (
    <PhoneShell header={<BackHeader to="/v2" />}>
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
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene()}
        title={badCode ? 'Partie introuvable' : 'Oups'}
        body={badCode ? 'Code invalide ou partie expirée.' : 'Une erreur est survenue. Réessaie.'}
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/v2' }) }}
      />
    </PhoneShell>
  );
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
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
    <PhoneShell header={<BackHeader to="/v2" />}>
      <p className={message} role="status">Recherche de la partie…</p>
    </PhoneShell>
  ),
});
