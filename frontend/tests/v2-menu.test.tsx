import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { MenuScreen } from '@/ui/v2/MenuScreen';
import { Route as V2Route } from '@/ui/routes/v2';
import { Route as V2IndexRoute } from '@/ui/routes/v2.index';
import { Route as HomeRoute } from '@/ui/routes/home';
import { Route as V2MenuRoute } from '@/ui/routes/v2.menu';
import { expectAxeClean } from '@/test/a11y';

function renderMenu() {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/v2/menu',
    component: () => <MenuScreen />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/v2/menu'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('v2 menu screen', () => {
  it('renders the h1, the menu nav and every item', async () => {
    renderMenu();

    expect(await screen.findByRole('heading', { level: 1, name: 'Menu' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Menu' })).toBeTruthy();
    expect(screen.getByText('Mon compte')).toBeTruthy();
    expect(screen.getByText('Réglages')).toBeTruthy();
    expect(screen.getByText('Mode sombre')).toBeTruthy();
    expect(screen.getByText('Aide')).toBeTruthy();
    expect(screen.getByText('Mentions légales')).toBeTruthy();
    expect(screen.getByText('Confidentialité')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toBeTruthy();
  });

  it('wires the legal links to the v2 legal routes', async () => {
    renderMenu();
    await screen.findByRole('heading', { level: 1, name: 'Menu' });

    expect(screen.getByRole('link', { name: 'Mentions légales' }).getAttribute('href')).toBe(
      '/v2/mentions-legales',
    );
    expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe(
      '/v2/confidentialite',
    );
  });

  it('marks the not-yet-built items as disabled rather than dead links', async () => {
    renderMenu();
    await screen.findByRole('heading', { level: 1, name: 'Menu' });

    expect(screen.queryByRole('link', { name: 'Mon compte' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull();
    expect(screen.getAllByText('Bientôt').length).toBeGreaterThanOrEqual(4);
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderMenu();
    await screen.findByRole('heading', { level: 1, name: 'Menu' });

    await expectAxeClean(container);
  });
});

// TanStack types `path` narrowly on the options union; read it via a cast.
const pathOf = (route: { options: object }) => (route.options as { path?: string }).path;

describe('v2 route wiring', () => {
  it('maps /v2 (index) to home while keeping /v2/home as an alias', () => {
    expect(pathOf(V2IndexRoute)).toBe('/');
    expect(pathOf(HomeRoute)).toBe('home');
    expect(V2IndexRoute.options.getParentRoute?.()).toBe(V2Route);
    expect(HomeRoute.options.getParentRoute?.()).toBe(V2Route);
  });

  it('registers /v2/menu under the v2 parent', () => {
    expect(pathOf(V2MenuRoute)).toBe('menu');
    expect(V2MenuRoute.options.getParentRoute?.()).toBe(V2Route);
    expect(V2MenuRoute.options.component).toBe(MenuScreen);
  });
});
