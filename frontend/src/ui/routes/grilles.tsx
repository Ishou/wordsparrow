import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

function GrillesRouteComponent() {
  // forward multiplayer adapters from context so the lobbies section shows when the flag is on (undefined hides it)
  const { puzzleRepository, soloEntriesStore, lobbyClient, getSession } = Route.useRouteContext();
  return (
    <GrillesArchiveScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      lobbyClient={lobbyClient}
      getSession={getSession}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles',
  component: GrillesRouteComponent,
  head: () => indexableHeadWithBreadcrumb('/grilles'),
});
