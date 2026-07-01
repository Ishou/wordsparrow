import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementTransparenceScreen } from '@/ui/v2/AbonnementTransparenceScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/transparence',
  component: AbonnementTransparenceScreen,
  head: () => noindexHead('Où va ton argent — WordSparrow', "Ce que finance l'abonnement WordSparrow."),
});
