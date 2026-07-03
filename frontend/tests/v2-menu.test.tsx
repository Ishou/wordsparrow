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
import { MenuSheet } from '@/ui/v2/MenuSheet';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as IndexRoute } from '@/ui/routes/index';
import { MenuRedirectRoute } from '@/ui/routes/redirects';
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

describe('v2 menu sheet', () => {
  it('opens from the home trigger and shows the profile header + rows', async () => {
    renderSheetWithTrigger();

    const trigger = await screen.findByRole('button', { name: 'Ouvrir le menu' });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Invité')).toBeTruthy();
    expect(screen.getByText('🔥 série 6')).toBeTruthy();
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

describe('route wiring', () => {
  it('maps the index route to the root home path under the app layout', () => {
    expect(pathOf(IndexRoute)).toBe('/');
    expect(IndexRoute.options.getParentRoute?.()).toBe(AppLayoutRoute);
  });

  it('redirects the retired /menu path to réglages', () => {
    expect(pathOf(MenuRedirectRoute)).toBe('menu');
    expect(MenuRedirectRoute.options.getParentRoute?.()).toBe(AppLayoutRoute);
  });
});
