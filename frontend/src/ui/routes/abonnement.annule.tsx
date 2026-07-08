import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementAnnuleScreen } from '@/ui/v2/AbonnementAnnuleScreen';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/annule',
  component: AbonnementAnnuleScreen,
  head: () =>
    noindexHead(t('seo.noindex.abonnementAnnule.title'), t('seo.noindex.abonnementAnnule.description')),
});
