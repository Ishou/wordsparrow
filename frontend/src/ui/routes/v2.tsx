import { createRoute, Outlet } from '@tanstack/react-router';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { buildHead, SITE_BASE_URL } from '@/ui/seo';
import { Route as RootRoute } from './__root';

// Single mount point isolating the DEV-only v2 design-system screens (ADR-0072) from prod routes.
// head() provides default SEO tags for the /v2 subtree; child routes override the title.
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
