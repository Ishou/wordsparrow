import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { LobbyClient } from '@/application/game';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';

// Shared "create a co-op game, or resume the one you already own" flow (ADR-0098 §6): a create response in IN_PROGRESS can only be a resume of the one active game you already own, so surface the modal instead of navigating.

type OwnedLobby = Lobby & { readonly id: LobbyId };

export interface UseCreateOrResumeArgs {
  readonly lobbyClient: LobbyClient;
  readonly getSession: () => { readonly sessionId: SessionId; readonly pseudonym: Pseudonym };
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
  // Relinquish-then-create in flight.
  readonly startingNew: boolean;
}

export function useCreateOrResume({
  lobbyClient,
  getSession,
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
    if (!old || startingNew) return;
    setStartingNew(true);
    const { sessionId, pseudonym } = getSession();
    // ADR-0098 §6 amendment: synchronous REST relinquish frees quota BEFORE create, so create can't race the WS frame and hand back the same IN_PROGRESS game.
    lobbyClient
      .relinquishOwnership(old.id)
      .then(() => lobbyClient.createLobby({ ownerSessionId: sessionId, ownerPseudonym: pseudonym }))
      .then((created) => {
        setStartingNew(false);
        // Re-check: if create still resolved to an owned IN_PROGRESS game, keep the modal open rather than navigate into a grid.
        if (created.state === 'IN_PROGRESS') {
          setOwnedGame(created);
          return;
        }
        setOwnedGame(null);
        goToLobby(created.id);
      })
      .catch((cause: unknown) => {
        setStartingNew(false);
        onError?.(cause);
      });
  }, [ownedGame, startingNew, getSession, lobbyClient, goToLobby, onError]);

  return { createOrResume, pending, ownedGame, rejoindre, startNewGame, dismiss, startingNew };
}
