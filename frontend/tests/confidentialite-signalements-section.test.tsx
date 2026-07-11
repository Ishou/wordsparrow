import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { ConfidentialiteScreen } from '@/ui/v2/ConfidentialiteScreen';
import { expectAxeClean } from '@/test/a11y';

function renderScreen() {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/confidentialite',
    component: () => <ConfidentialiteScreen />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/confidentialite'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('ConfidentialiteScreen — signalements RGPD section', () => {
  it('renders the signalements heading as an h2 with what/why/retention/rights', async () => {
    const { container } = renderScreen();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Signalements de définitions' }),
    ).toBeTruthy();
    expect(screen.getByText(/on enregistre le mot et la définition/)).toBeTruthy();
    expect(screen.getByText(/anonymisés/)).toBeTruthy();

    await expectAxeClean(container);
  });
});
