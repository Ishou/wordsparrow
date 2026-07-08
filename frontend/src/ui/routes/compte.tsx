import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { CompteScreen } from '@/ui/v2/CompteScreen';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'compte',
  component: CompteScreen,
  head: () => noindexHead(t('seo.noindex.compte.title'), t('seo.noindex.compte.description')),
});
