import { createRoute, Outlet } from '@tanstack/react-router';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { Route as RootRoute } from './__root';

// Single mount point isolating the DEV-only v2 design-system screens (ADR-0072) from prod routes.
export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/v2',
  component: () => <Outlet />,
  notFoundComponent: NotFoundScreen,
});
