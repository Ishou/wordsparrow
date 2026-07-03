import { fireEvent, render, screen } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { LobbySummary } from '@/application/game';
import type { LobbyId } from '@/domain/game';
import { GrillesLobbiesSection } from '@/ui/v2/GrillesLobbiesSection';
import { LobbiesEmptyState } from '@/ui/v2/GrillesEmptyState';
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
});

describe('LobbiesEmptyState', () => {
  it('renders the empty state CTA when there are no lobbies', () => {
    const onCreate = vi.fn();
    render(<LobbiesEmptyState onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer une partie' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
