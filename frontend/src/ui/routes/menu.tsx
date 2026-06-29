import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { MenuScreen } from '@/ui/v2/MenuScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'menu',
  component: MenuScreen,
  head: () => noindexHead('Menu — WordSparrow', 'Accède aux différentes parties de WordSparrow.'),
});
