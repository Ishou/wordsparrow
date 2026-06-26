import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { MenuScreen } from '@/ui/v2/MenuScreen';
import { MenuSheet } from '@/ui/v2/MenuSheet';
import { Route as V2Route } from '@/ui/routes/v2';
import { Route as V2IndexRoute } from '@/ui/routes/v2.index';
import { Route as HomeRoute } from '@/ui/routes/home';
import { Route as V2MenuRoute } from '@/ui/routes/v2.menu';
import { expectAxeClean } from '@/test/a11y';

// zag schedules dismiss/focus-trap listeners via rAF + setTimeout; drain both before firing close events.
const flushDialog = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

function renderSheetWithTrigger(onCloseSpy?: () => void) {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Ouvrir le menu
        </button>
        <MenuSheet
          open={open}
          onClose={() => {
            onCloseSpy?.();
            setOpen(false);
          }}
          streak={6}
        />
      </>
    );
  }
  const rootRoute = createRootRoute();
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Harness });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

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

describe('v2 menu sheet', () => {
  it('opens from the home trigger and shows the profile header + rows', async () => {
    renderSheetWithTrigger();

    const trigger = await screen.findByRole('button', { name: 'Ouvrir le menu' });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Toi')).toBeTruthy();
    expect(screen.getByText('Joueur invité · 🔥 série 6')).toBeTruthy();
    expect(screen.getByText('Mon compte')).toBeTruthy();
    expect(screen.getByText('Réglages')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Mode sombre' })).toBeTruthy();
    expect(screen.getByText('Aide')).toBeTruthy();
    expect(screen.queryByText('Mentions & confidentialité')).toBeNull();
  });

  it('renders a visible (display:block) grab handle at the top of the sheet', async () => {
    renderSheetWithTrigger();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    const dialog = await screen.findByRole('dialog');
    // The pill is decorative; find it by its hidden span and assert the block fix that makes it render.
    const grab = dialog.querySelector('span[aria-hidden="true"]');
    expect(grab).toBeTruthy();
    expect(grab?.className).toContain('d_block');
  });

  it('navigates Réglages and keeps placeholders non-navigating', async () => {
    renderSheetWithTrigger();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    await screen.findByRole('dialog');

    expect(screen.getByRole('button', { name: 'Réglages' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mentions & confidentialité/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mon compte' })).toBeNull();
    expect(screen.getAllByText('Bientôt').length).toBeGreaterThanOrEqual(2);
  });

  it('closes on Escape (ADR-0050)', async () => {
    const onClose = vi.fn();
    renderSheetWithTrigger(onClose);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    await screen.findByRole('dialog');
    await flushDialog();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('returns focus to the trigger when closed', async () => {
    renderSheetWithTrigger();
    const trigger = await screen.findByRole('button', { name: 'Ouvrir le menu' });
    // jsdom doesn't focus on click; focus explicitly so Ark has a node to restore to.
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    await flushDialog();

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('menu-sheet-backdrop'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(document.activeElement).toBe(trigger), { timeout: 4000 });
  });

  it('is axe-clean when open (ADR-0050)', async () => {
    const { baseElement } = renderSheetWithTrigger();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    await screen.findByRole('dialog');

    await expectAxeClean(baseElement);
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
