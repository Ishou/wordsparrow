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
import { CheckoutCancelScreen } from '@/ui/routes/abonnement.annule';

// A real one-route memory router so the screen's `<Link>` resolves (page-shell test pattern).
function renderInRouter(node: ReactNode) {
  const rootRoute = createRootRoute();
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/abonnement/annule',
    component: () => <>{node}</>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    history: createMemoryHistory({ initialEntries: ['/abonnement/annule'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('CheckoutCancelScreen', () => {
  it('renders the cancelled copy and a link back to the abonnement screen', async () => {
    renderInRouter(<CheckoutCancelScreen />);

    expect(await screen.findByText("Aucun montant n'a été débité.")).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /Revenir à mon abonnement/ });
    expect(back).toHaveAttribute('href', '/abonnement');
  });
});
