import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { RemerciementsScreen } from '@/ui/v2/RemerciementsScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'remerciements',
  component: RemerciementsScreen,
  head: () => indexableHeadWithBreadcrumb('/remerciements'),
});
