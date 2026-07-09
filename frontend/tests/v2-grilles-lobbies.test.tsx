import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/lib/shareInvite', () => ({
  canNativeShare: vi.fn(() => false),
  useCanNativeShare: vi.fn(() => false),
  shareOrCopyInviteUrl: vi.fn(async () => 'copied' as const),
}));

import { shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';
import type { LobbySummary } from '@/application/game';
import type { LobbyId } from '@/domain/game';
import { GrillesLobbiesSection } from '@/ui/v2/GrillesLobbiesSection';
import { LobbiesEmptyState } from '@/ui/v2/GrillesEmptyState';
import { Toast, ToastProvider } from '@/ui/components/primitives/Toast';
import { expectAxeClean } from '@/test/a11y';

const IN_PROGRESS: LobbySummary = {
  id: 'AAAA1111BBBB2222CCCC3333' as LobbyId,
  code: 'A2B3C4',
  state: 'IN_PROGRESS',
  gridConfig: { width: 7, height: 7 },
  playerCount: 3,
  connectedCount: 2,
  lastActivityAt: '2026-06-28T12:00:00Z',
  progress: { solvedCells: 12, totalCells: 50 },
};

const COMPLETED: LobbySummary = {
  id: 'DDDD4444EEEE5555FFFF6666' as LobbyId,
  code: 'X9Y8Z7',
  state: 'COMPLETED',
  title: 'Grille du soir',
  gridConfig: { width: 9, height: 9 },
  playerCount: 1,
  connectedCount: 0,
  lastActivityAt: '2026-06-20T12:00:00Z',
  progress: { solvedCells: 60, totalCells: 60 },
};

function renderInRouter(node: React.ReactNode) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <>{node}</> });
  const lobby = createRoute({ getParentRoute: () => root, path: '/lobby/$lobbyId', component: () => <div>lobby</div> });
  const router = createRouter({
    routeTree: root.addChildren([index, lobby]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router as never} />);
}

function renderInRouterWithToast(node: React.ReactNode) {
  return renderInRouter(
    <ToastProvider>
      {node}
      <Toast />
    </ToastProvider>,
  );
}

describe('GrillesLobbiesSection', () => {
  it('lists lobbies with state, players and deep link — no internal heading', async () => {
    renderInRouter(<GrillesLobbiesSection lobbies={[IN_PROGRESS, COMPLETED]} />);

    const resume = await screen.findByRole('link', { name: 'Reprendre — Partie du 28 juin' });
    expect(resume.getAttribute('href')).toBe(`/lobby/${IN_PROGRESS.id}`);
    expect(screen.getByRole('link', { name: 'Revoir — Grille du soir' })).toBeInTheDocument();
    expect(screen.getByText(/3 joueurs · En cours · 12 \/ 50 cases/)).toBeInTheDocument();
    expect(screen.getByText(/1 joueur · Terminée/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Parties à plusieurs' })).not.toBeInTheDocument();
  });

  it('shows a progress bar only for in-progress lobbies', async () => {
    const { container } = renderInRouter(<GrillesLobbiesSection lobbies={[IN_PROGRESS, COMPLETED]} />);
    await screen.findByText('Grille du soir');
    expect(container.querySelectorAll('[data-testid="lobby-progress"]')).toHaveLength(1);
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderInRouter(<GrillesLobbiesSection lobbies={[IN_PROGRESS, COMPLETED]} />);
    await screen.findByText('Grille du soir');
    await expectAxeClean(container);
  });

  it('an ownerless "Reprendre" row claims ownership instead of navigating (ADR-0098 §6)', async () => {
    const onClaim = vi.fn();
    const OWNERLESS: LobbySummary = { ...IN_PROGRESS, ownerless: true };
    renderInRouter(<GrillesLobbiesSection lobbies={[OWNERLESS]} onClaim={onClaim} />);
    const claim = await screen.findByRole('button', { name: 'Reprendre — Partie du 28 juin' });
    fireEvent.click(claim);
    expect(onClaim).toHaveBeenCalledWith(OWNERLESS.id);
    // No navigation link is rendered for the claimable row.
    expect(screen.queryByRole('link', { name: 'Reprendre — Partie du 28 juin' })).toBeNull();
  });

  it('a non-ownerless "Reprendre" row stays a navigation link even when onClaim is supplied', async () => {
    const onClaim = vi.fn();
    renderInRouter(<GrillesLobbiesSection lobbies={[IN_PROGRESS]} onClaim={onClaim} />);
    const resume = await screen.findByRole('link', { name: 'Reprendre — Partie du 28 juin' });
    expect(resume.getAttribute('href')).toBe(`/lobby/${IN_PROGRESS.id}`);
    expect(onClaim).not.toHaveBeenCalled();
  });
});

describe('GrillesLobbiesSection — leave/delete affordance (ADR-0098 §6)', () => {
  const ALONE: LobbySummary = { ...COMPLETED, playerCount: 1 };
  const WITH_OTHERS: LobbySummary = { ...IN_PROGRESS, playerCount: 3 };

  it('shows a "Supprimer" (delete) confirm for a solo row and calls onLeave on confirm', async () => {
    const onLeave = vi.fn();
    renderInRouter(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    // Dialog title + destructive confirm copy.
    await screen.findByRole('dialog');
    expect(screen.getByText('Supprimer cette partie ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onLeave).toHaveBeenCalledWith(ALONE.id);
  });

  it('shows a "Quitter" (leave) confirm for a multi-player row and calls onLeave on confirm', async () => {
    const onLeave = vi.fn();
    renderInRouter(<GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter cette partie' }));
    await screen.findByRole('dialog');
    expect(screen.getByText('Quitter cette partie ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(onLeave).toHaveBeenCalledWith(WITH_OTHERS.id);
  });

  it('cancelling the confirm does not call onLeave', async () => {
    const onLeave = vi.fn();
    renderInRouter(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('tapping the leave button does not navigate the row', async () => {
    const onLeave = vi.fn();
    renderInRouter(<GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={onLeave} />);
    const leave = await screen.findByRole('button', { name: 'Quitter cette partie' });
    fireEvent.click(leave);
    // Still on the list route — the lobby placeholder never rendered.
    expect(screen.queryByText('lobby')).toBeNull();
    // The navigate link is a distinct element, untouched.
    expect(screen.getByRole('link', { name: 'Reprendre — Partie du 28 juin' })).toBeInTheDocument();
  });

  it('the open confirm dialog is axe-clean (ADR-0050)', async () => {
    renderInRouter(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    const dialog = await screen.findByRole('dialog');
    await expectAxeClean(dialog);
  });
});

describe('GrillesLobbiesSection — confirm pending state (ADR-0050)', () => {
  const ALONE: LobbySummary = { ...COMPLETED, playerCount: 1 };

  function deferred() {
    let resolve!: () => void;
    let reject!: () => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('disables the confirm + sets aria-busy while onConfirm is in flight, and does not fire twice', async () => {
    const d = deferred();
    const onLeave = vi.fn(() => d.promise);
    renderInRouterWithToast(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const processing = await screen.findByRole('button', { name: 'Traitement…' });
    expect(processing).toBeDisabled();
    expect(processing).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();

    // A second tap on the disabled confirm must not re-enter.
    fireEvent.click(processing);
    expect(onLeave).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialog open on failure so the user can retry', async () => {
    const d = deferred();
    const onLeave = vi.fn(() => d.promise);
    renderInRouterWithToast(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await act(async () => {
      d.reject();
      await d.promise.catch(() => undefined);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Confirm is re-enabled for the retry.
    expect(await screen.findByRole('button', { name: 'Supprimer' })).toBeEnabled();
  });

  it('the busy dialog is axe-clean (ADR-0050)', async () => {
    const d = deferred();
    renderInRouterWithToast(<GrillesLobbiesSection lobbies={[ALONE]} onLeave={() => d.promise} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('button', { name: 'Traitement…' });
    await expectAxeClean(dialog);
    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });
});

describe('GrillesLobbiesSection — differentiated error copy (ADR-0098 §6)', () => {
  const ALONE: LobbySummary = { ...COMPLETED, playerCount: 1 };
  const WITH_OTHERS: LobbySummary = { ...IN_PROGRESS, playerCount: 3 };

  it('a failed delete surfaces the "supprimer" error copy', async () => {
    renderInRouterWithToast(
      <GrillesLobbiesSection lobbies={[ALONE]} onLeave={() => Promise.reject(new Error('boom'))} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette partie' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Impossible de supprimer la partie. Réessaie.')).toBeInTheDocument();
  });

  it('a failed leave surfaces the "quitter" error copy', async () => {
    renderInRouterWithToast(
      <GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={() => Promise.reject(new Error('boom'))} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter cette partie' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(await screen.findByText('Impossible de quitter la partie. Réessaie.')).toBeInTheDocument();
  });
});

describe('GrillesLobbiesSection — retention note', () => {
  it('renders the inactivity retention note under the list', async () => {
    renderInRouter(<GrillesLobbiesSection lobbies={[IN_PROGRESS]} />);
    expect(
      await screen.findByText('Les parties inactives sont supprimées automatiquement après plusieurs jours.'),
    ).toBeInTheDocument();
  });
});

describe('GrillesLobbiesSection — share-invite affordance', () => {
  const WITH_OTHERS: LobbySummary = { ...IN_PROGRESS, playerCount: 3 };

  it('copies the /join/<code> link and shows the confirmation, next to the leave button', async () => {
    vi.mocked(shareOrCopyInviteUrl).mockClear();
    renderInRouter(<GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={vi.fn()} />);
    const share = await screen.findByRole('button', { name: 'Copier le lien' });
    expect(screen.getByRole('button', { name: 'Quitter cette partie' })).toBeInTheDocument();
    fireEvent.click(share);
    await waitFor(() =>
      expect(shareOrCopyInviteUrl).toHaveBeenCalledWith(`${window.location.origin}/join/${WITH_OTHERS.code}`),
    );
    expect(await screen.findByText('Copié')).toBeInTheDocument();
  });

  it('tapping the share button does not navigate the row', async () => {
    renderInRouter(<GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copier le lien' }));
    expect(screen.queryByText('lobby')).toBeNull();
    expect(screen.getByRole('link', { name: 'Reprendre — Partie du 28 juin' })).toBeInTheDocument();
  });

  it('the row with share + leave is axe-clean (ADR-0050)', async () => {
    const { container } = renderInRouter(<GrillesLobbiesSection lobbies={[WITH_OTHERS]} onLeave={vi.fn()} />);
    await screen.findByRole('button', { name: 'Copier le lien' });
    await expectAxeClean(container);
  });
});

describe('LobbiesEmptyState', () => {
  it('renders the empty state CTA when there are no lobbies', () => {
    const onCreate = vi.fn();
    render(<LobbiesEmptyState onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer une partie' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
