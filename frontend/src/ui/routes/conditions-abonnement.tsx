import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ConditionsAbonnementScreen } from '@/ui/v2/ConditionsAbonnementScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'conditions-abonnement',
  component: ConditionsAbonnementScreen,
  // noindex while the terms are a draft pending the accountant's finalisation.
  head: () =>
    noindexHead(
      "Conditions d'abonnement — WordSparrow",
      "Conditions générales de vente de l'abonnement WordSparrow.",
    ),
});
