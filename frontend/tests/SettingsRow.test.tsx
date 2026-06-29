import { fireEvent, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Lock, SignOut } from '@phosphor-icons/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsRow } from '@/ui/v2/SettingsRow';
import { expectAxeClean } from '@/test/a11y';

function renderInRouter(node: ReactNode) {
  const rootRoute = createRootRoute();
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <ul>{node}</ul> });
  const confidentialite = createRoute({ getParentRoute: () => rootRoute, path: '/confidentialite', component: () => <>ok</> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, confidentialite]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('SettingsRow', () => {
  it('renders a TanStack link with a chevron for the `to` variant', async () => {
    renderInRouter(<SettingsRow icon={Lock} to="/confidentialite" label="Confidentialité" />);
    const link = await screen.findByRole('link', { name: 'Confidentialité' });
    expect(link.getAttribute('href')).toBe('/confidentialite');
  });

  it('renders a mailto anchor without target=_blank', async () => {
    renderInRouter(<SettingsRow icon={Lock} href="mailto:contact@wordsparrow.io" label="Nous écrire" />);
    const link = await screen.findByRole('link', { name: 'Nous écrire' });
    expect(link.getAttribute('href')).toBe('mailto:contact@wordsparrow.io');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('opens external links in a new tab with a safe rel', async () => {
    renderInRouter(<SettingsRow icon={Lock} href="https://example.com" label="Externe" />);
    const link = await screen.findByRole('link', { name: 'Externe' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('renders a button that fires onClick for the action variant', async () => {
    const onClick = vi.fn();
    renderInRouter(<SettingsRow icon={SignOut} label="Se déconnecter" onClick={onClick} />);
    const button = await screen.findByRole('button', { name: 'Se déconnecter' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders a non-interactive row with a sublabel and no chevron when static', async () => {
    renderInRouter(<SettingsRow icon={Lock} label="Google" sub="Compte connecté" />);
    expect(await screen.findByText('Google')).toBeTruthy();
    expect(screen.getByText('Compte connecté')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is axe-clean across all variants (ADR-0050)', async () => {
    const { container } = renderInRouter(
      <>
        <SettingsRow icon={Lock} to="/confidentialite" label="Confidentialité" />
        <SettingsRow icon={SignOut} label="Se déconnecter" onClick={() => {}} />
        <SettingsRow icon={Lock} label="Google" sub="Compte connecté" last />
      </>,
    );
    await screen.findByRole('link', { name: 'Confidentialité' });
    await expectAxeClean(container);
  });
});
