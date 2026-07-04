import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ConditionsAbonnementScreen } from '@/ui/v2/ConditionsAbonnementScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'conditions-abonnement',
  component: ConditionsAbonnementScreen,
  head: () => indexableHeadWithBreadcrumb('/conditions-abonnement'),
});
