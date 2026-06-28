import { useEffect } from 'react';
import { createRoute, Outlet } from '@tanstack/react-router';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { buildHead, SITE_BASE_URL } from '@/ui/seo';
import { Route as RootRoute } from './__root';

// The v2 surround is jade; align the document background so the macOS rubber-band/overscroll shows the
// gradient top instead of the v1 cream (#FAF6EB). Scoped to /v2 (restored on leave) until the cutover.
function V2Layout() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.backgroundColor;
    html.style.backgroundColor = '#CDE9DA';
    return () => { html.style.backgroundColor = prev; };
  }, []);
  return <Outlet />;
}

// Single mount point isolating the DEV-only v2 design-system screens (ADR-0072) from prod routes.
// head() provides default SEO tags for the /v2 subtree; child routes override the title.
export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/v2',
  component: V2Layout,
  notFoundComponent: NotFoundScreen,
  head: () =>
    buildHead({
      title: 'WordSparrow',
      description: 'WordSparrow — mots fléchés en français. Une nouvelle grille chaque jour.',
      canonical: `${SITE_BASE_URL}/v2`,
    }),
});
