import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { GameClient, LobbyClient } from '@/application/game';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';

// Shared "create a co-op game, or resume the one you already own" flow (ADR-0098 §6): a create response in IN_PROGRESS can only be a resume of the one active game you already own, so surface the modal instead of navigating.

type OwnedLobby = Lobby & { readonly id: LobbyId };

export interface UseCreateOrResumeArgs {
  readonly lobbyClient: LobbyClient;
  readonly getSession: () => { readonly sessionId: SessionId; readonly pseudonym: Pseudonym };
  // Required for the sole-occupant "Démarrer une nouvelle partie" relinquish path (ADR-0098 §6).
  readonly gameClient?: GameClient;
  // Site-specific failure handling: re-open the host sign-in sheet on a 401, toast on replay, etc.
  readonly onError?: (cause: unknown) => void;
}

export interface UseCreateOrResume {
  // Callers gate the anon → sign-in prompt upstream (ADR-0083); this runs only for a signed-in player.
  readonly createOrResume: () => void;
  readonly pending: boolean;
  // Non-null while the informational modal is open — the already-owned active game the create resolved to.
  readonly ownedGame: OwnedLobby | null;
  readonly rejoindre: () => void;
  readonly startNewGame: () => void;
  readonly dismiss: () => void;
  // Relinquish-then-create in flight (the sole-occupant path).
  readonly startingNew: boolean;
  // ADR-0098 §6: offered only to a sole occupant with a reachable WS client.
  readonly canStartNew: boolean;
}

export function useCreateOrResume({
  lobbyClient,
  getSession,
  gameClient,
  onError,
}: UseCreateOrResumeArgs): UseCreateOrResume {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [ownedGame, setOwnedGame] = useState<OwnedLobby | null>(null);
  const [startingNew, setStartingNew] = useState(false);

  const goToLobby = useCallback(
    (lobbyId: LobbyId) => {
      void navigate({ to: '/lobby/$lobbyId', params: { lobbyId } });
    },
    [navigate],
  );

  const createOrResume = useCallback(() => {
    if (pending || startingNew) return;
    setPending(true);
    const { sessionId: ownerSessionId, pseudonym: ownerPseudonym } = getSession();
    lobbyClient
      .createLobby({ ownerSessionId, ownerPseudonym })
      .then((created) => {
        setPending(false);
        if (created.state === 'IN_PROGRESS') {
          setOwnedGame(created);
          return;
        }
        goToLobby(created.id);
      })
      .catch((cause: unknown) => {
        setPending(false);
        onError?.(cause);
      });
  }, [pending, startingNew, getSession, lobbyClient, goToLobby, onError]);

  const rejoindre = useCallback(() => {
    if (ownedGame) goToLobby(ownedGame.id);
  }, [ownedGame, goToLobby]);

  const dismiss = useCallback(() => {
    // ADR-0098 §6: ignored mid-relinquish so a stray dismiss/Escape can't override startNewGame's pending navigation.
    if (startingNew) return;
    setOwnedGame(null);
  }, [startingNew]);

  const startNewGame = useCallback(() => {
    const old = ownedGame;
    if (!old || !gameClient || startingNew) return;
    setStartingNew(true);
    const { sessionId, pseudonym } = getSession();
    // Relinquish is WS-only (ADR-0098 §2): the explicit `leaveLobby` frame nulls `owner_user_id` server-side, freeing quota for the create that follows.
    gameClient
      .connect({ lobbyId: old.id, sessionId, pseudonym })
      .then(() => {
        gameClient.leaveLobby();
        gameClient.disconnect();
        return lobbyClient.createLobby({ ownerSessionId: sessionId, ownerPseudonym: pseudonym });
      })
      .then((created) => {
        setStartingNew(false);
        setOwnedGame(null);
        goToLobby(created.id);
      })
      .catch((cause: unknown) => {
        setStartingNew(false);
        onError?.(cause);
      });
  }, [ownedGame, gameClient, startingNew, getSession, lobbyClient, goToLobby, onError]);

  const canStartNew = ownedGame != null && ownedGame.players.length === 1 && gameClient != null;

  return { createOrResume, pending, ownedGame, rejoindre, startNewGame, dismiss, startingNew, canStartNew };
}
