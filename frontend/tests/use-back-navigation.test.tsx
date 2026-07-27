import { fireEvent, render, screen } from '@testing-library/react';
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { useBackNavigation } from '@/ui/lib/useBackNavigation';
import { BackHeader } from '@/ui/v2/BackHeader';

function BackControl() {
  const onBack = useBackNavigation();
  return (
    <Link to="/reglages" onClick={onBack}>
      Retour
    </Link>
  );
}

function renderAt(initialEntries: string[]) {
  const rootRoute = createRootRoute();
  const compte = createRoute({
    getParentRoute: () => rootRoute,
    path: '/compte',
    component: () => (
      <>
        <h1>compte</h1>
        <BackControl />
      </>
    ),
  });
  const reglages = createRoute({ getParentRoute: () => rootRoute, path: '/reglages', component: () => <h1>reglages</h1> });
  const play = createRoute({
    getParentRoute: () => rootRoute,
    path: '/play',
    component: () => (
      <>
        <h1>play</h1>
        <Link to="/compte">aller au compte</Link>
      </>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([compte, reglages, play]),
    history: createMemoryHistory({ initialEntries }),
  });
  return render(<RouterProvider router={router} />);
}

describe('useBackNavigation', () => {
  it('falls back to the absolute route on a cold entry (no history to walk)', async () => {
    renderAt(['/compte']);

    fireEvent.click(await screen.findByRole('link', { name: 'Retour' }));

    expect(await screen.findByRole('heading', { name: 'reglages' })).toBeTruthy();
  });

  it('returns to the previous page when the player navigated there in-app', async () => {
    renderAt(['/play']);
    fireEvent.click(await screen.findByRole('link', { name: 'aller au compte' }));
    await screen.findByRole('heading', { name: 'compte' });

    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));

    expect(await screen.findByRole('heading', { name: 'play' })).toBeTruthy();
  });

  it('leaves modifier-clicks to the browser', async () => {
    renderAt(['/play']);
    fireEvent.click(await screen.findByRole('link', { name: 'aller au compte' }));
    await screen.findByRole('heading', { name: 'compte' });

    const back = screen.getByRole('link', { name: 'Retour' });
    fireEvent.click(back, { metaKey: true });

    expect(screen.getByRole('heading', { name: 'compte' })).toBeTruthy();
  });

  it('keeps the fallback in href so the control stays a real link', async () => {
    renderAt(['/compte']);

    expect((await screen.findByRole('link', { name: 'Retour' })).getAttribute('href')).toBe('/reglages');
  });
});

describe('BackHeader', () => {
  function renderHeaderAt(initialEntries: string[]) {
    const rootRoute = createRootRoute();
    const compte = createRoute({
      getParentRoute: () => rootRoute,
      path: '/compte',
      component: () => <BackHeader to="/reglages" />,
    });
    const reglages = createRoute({ getParentRoute: () => rootRoute, path: '/reglages', component: () => <h1>reglages</h1> });
    const play = createRoute({
      getParentRoute: () => rootRoute,
      path: '/play',
      component: () => <><h1>play</h1><Link to="/compte">au compte</Link></>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([compte, reglages, play]),
      history: createMemoryHistory({ initialEntries }),
    });
    return render(<RouterProvider router={router} />);
  }

  it('returns to the page the player came from', async () => {
    renderHeaderAt(['/play']);
    fireEvent.click(await screen.findByRole('link', { name: 'au compte' }));
    const back = await screen.findByRole('link', { name: /Retour/ });

    fireEvent.click(back);

    expect(await screen.findByRole('heading', { name: 'play' })).toBeTruthy();
  });

  it('falls back to its `to` prop on a cold entry, keeping it in href', async () => {
    renderHeaderAt(['/compte']);
    const back = await screen.findByRole('link', { name: /Retour/ });
    expect(back.getAttribute('href')).toBe('/reglages');

    fireEvent.click(back);

    expect(await screen.findByRole('heading', { name: 'reglages' })).toBeTruthy();
  });
});
