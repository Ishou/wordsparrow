import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementScreen } from '@/ui/v2/AbonnementScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement',
  component: AbonnementScreen,
  head: () => noindexHead('Abonnement — WordSparrow', 'Gère ton abonnement WordSparrow.'),
});
