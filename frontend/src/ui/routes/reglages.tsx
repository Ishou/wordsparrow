import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ReglagesScreen } from '@/ui/v2/ReglagesScreen';
import { noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'reglages',
  component: ReglagesScreen,
  head: () => noindexHead(t('seo.noindex.reglages.title'), t('seo.noindex.reglages.description')),
});
