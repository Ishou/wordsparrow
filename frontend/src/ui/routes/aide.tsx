import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AideScreen } from '@/ui/v2/AideScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'aide',
  component: AideScreen,
  head: () => indexableHeadWithBreadcrumb('/aide'),
});
