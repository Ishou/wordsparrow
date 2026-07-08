import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { AbonnementScreen } from '@/ui/v2/AbonnementScreen';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement',
  component: AbonnementScreen,
  head: () => noindexHead(t('seo.noindex.abonnement.title'), t('seo.noindex.abonnement.description')),
});
