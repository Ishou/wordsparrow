import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

function GrillesRouteComponent() {
  const { puzzleRepository, soloEntriesStore } = Route.useRouteContext();
  return <GrillesArchiveScreen puzzleRepository={puzzleRepository} soloEntriesStore={soloEntriesStore} />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles',
  component: GrillesRouteComponent,
  head: () => indexableHeadWithBreadcrumb('/grilles'),
});
