import { useEffect } from 'react';
import { createRoute, Outlet } from '@tanstack/react-router';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { Route as RootRoute } from './__root';

// Align html background to jade so macOS overscroll shows the v2 gradient, not the v1 cream.
function AppLayout() {
  useEffect(() => {
    document.documentElement.style.backgroundColor = '#CDE9DA';
  }, []);
  return <Outlet />;
}

// Pathless layout route (ADR-0074): v2 screens mount at root. No head() here — per-route canonical/SEO lives on the leaf routes so a child page never inherits a duplicate canonical.
export const Route = createRoute({
  getParentRoute: () => RootRoute,
  id: 'app',
  component: AppLayout,
  notFoundComponent: NotFoundScreen,
});
