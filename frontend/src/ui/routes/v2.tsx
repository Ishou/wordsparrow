import { createRoute, Outlet } from '@tanstack/react-router';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { buildHead, SITE_BASE_URL } from '@/ui/seo';
import { Route as RootRoute } from './__root';

// Single mount point isolating the DEV-only v2 design-system screens (ADR-0072) from prod routes.
// Default head for the whole /v2 subtree; child routes override the title. Not noindex — these
// screens are the eventual prod app (reconciliation plan) and noindex tanks the Lighthouse SEO score.
export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/v2',
  component: () => <Outlet />,
  notFoundComponent: NotFoundScreen,
  head: () =>
    buildHead({
      title: 'WordSparrow',
      description: 'WordSparrow — mots fléchés en français. Une nouvelle grille chaque jour.',
      canonical: `${SITE_BASE_URL}/v2`,
    }),
});
