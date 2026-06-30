import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementSuccesScreen } from '@/ui/v2/AbonnementSuccesScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/succes',
  component: AbonnementSuccesScreen,
  head: () => noindexHead('Merci — WordSparrow', 'Confirmation de ton abonnement WordSparrow.'),
});
