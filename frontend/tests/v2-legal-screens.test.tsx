import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
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

describe('v2 legal screens', () => {
  it('mentions légales: h1 + sections + back link, a11y clean', async () => {
    const { container } = renderInRouter(<MentionsLegalesScreen />, '/v2/mentions-legales');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mentions légales' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Éditeur' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Hébergement' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Données personnelles' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toHaveAttribute('href', '/v2/reglages');
    expect(container.querySelector('main#main-content')).toBeTruthy();

    await expectAxeClean(container);
  });

  it('confidentialité: concise lede + three sections + CTA, a11y clean', async () => {
    const { container } = renderInRouter(<ConfidentialiteScreen />, '/v2/confidentialite');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confidentialité' }),
    ).toBeTruthy();
    expect(screen.getByText(/On garde les choses simples/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Ce que l'on collecte/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cookies' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Tes droits' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gérer mes préférences' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toHaveAttribute('href', '/v2/reglages');
    expect(container.querySelector('main#main-content')).toBeTruthy();

    await expectAxeClean(container);
  });
});
