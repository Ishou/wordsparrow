import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { ReglagesScreen } from '@/ui/v2/ReglagesScreen';
import { expectAxeClean } from '@/test/a11y';

function renderReglages() {
  const rootRoute = createRootRoute();
  const reglages = createRoute({
    getParentRoute: () => rootRoute,
    path: '/v2/reglages',
    component: () => <ReglagesScreen />,
  });
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <>{path}</> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      reglages,
      stub('/v2/confidentialite'),
      stub('/v2/mentions-legales'),
      stub('/v2'),
    ]),
    history: createMemoryHistory({ initialEntries: ['/v2/reglages'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('v2 réglages screen', () => {
  it('renders the title, profile row and the three group headings', async () => {
    renderReglages();

    expect(await screen.findByRole('heading', { level: 1, name: 'Réglages' })).toBeTruthy();
    expect(screen.getByText('Toi')).toBeTruthy();
    expect(screen.getByText('Joueur invité')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Préférences' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Confidentialité & légal' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Aide' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toBeTruthy();
  });

  it('links Confidentialité and Mentions légales to their v2 routes', async () => {
    renderReglages();
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });

    expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe(
      '/v2/confidentialite',
    );
    expect(screen.getByRole('link', { name: 'Mentions légales' }).getAttribute('href')).toBe(
      '/v2/mentions-legales',
    );
  });

  it('keeps the not-yet-built rows inert and the theme toggle a disabled switch', async () => {
    renderReglages();
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });

    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByRole('link', { name: "Conditions d'utilisation" })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Gérer les cookies' })).toBeNull();
    expect(screen.getAllByText('Bientôt').length).toBe(6);

    const toggle = screen.getByRole('switch', { name: 'Thème sombre' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderReglages();
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });

    await expectAxeClean(container);
  });
});
