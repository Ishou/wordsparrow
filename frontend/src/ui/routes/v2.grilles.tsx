import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { Route as V2Route } from './v2';

function GrillesRouteComponent() {
  const { puzzleRepository, soloEntriesStore } = Route.useRouteContext();
  return <GrillesArchiveScreen puzzleRepository={puzzleRepository} soloEntriesStore={soloEntriesStore} />;
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'grilles',
  component: GrillesRouteComponent,
});
