import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionClient } from '@/application/session/SessionClient';
import { MentionsLegalesScreen } from '@/ui/v2/MentionsLegalesScreen';
import { ConfidentialiteScreen } from '@/ui/v2/ConfidentialiteScreen';
import { expectAxeClean } from '@/test/a11y';

function renderInRouter(node: ReactNode, path: string) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <>{node}</>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

function stubSessionClient(): SessionClient {
  return {
    eraseSession: vi.fn(async () => ({ deleted: 0 })),
    getSessionId: vi.fn(() => 'session-id'),
    clearLocalSession: vi.fn(),
  };
}

describe('v2 legal screens', () => {
  it('mentions légales: h1 + sections + back link, a11y clean', async () => {
    const { container } = renderInRouter(<MentionsLegalesScreen />, '/v2/mentions-legales');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mentions légales' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Éditeur' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Hébergement' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Données personnelles' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toBeTruthy();
    expect(container.querySelector('main#main-content')).toBeTruthy();

    await expectAxeClean(container);
  });

  it('confidentialité: reuses PrivacyNotice (FR) with its h1, a11y clean', async () => {
    const { container } = renderInRouter(
      <ConfidentialiteScreen sessionClient={stubSessionClient()} />,
      '/v2/confidentialite',
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Politique de confidentialité' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toBeTruthy();
    expect(container.querySelector('main#main-content')).toBeTruthy();

    await expectAxeClean(container);
  });
});
