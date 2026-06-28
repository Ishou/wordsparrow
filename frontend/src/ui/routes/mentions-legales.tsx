import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { MentionsLegalesScreen } from '@/ui/v2/MentionsLegalesScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'mentions-legales',
  component: MentionsLegalesScreen,
  head: () => indexableHeadWithBreadcrumb('/mentions-legales'),
});
