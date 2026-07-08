import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementSuccesScreen } from '@/ui/v2/AbonnementSuccesScreen';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/succes',
  component: AbonnementSuccesScreen,
  head: () =>
    noindexHead(t('seo.noindex.abonnementSucces.title'), t('seo.noindex.abonnementSucces.description')),
});
