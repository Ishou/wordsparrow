import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { HomeScreen } from '@/ui/home/HomeScreen';
import { Route as V2Route } from './v2';

function V2IndexComponent() {
  // forward multiplayer adapters from context so HomeScreen shows co-op + join when the flag is on (undefined hides them)
  const { puzzleRepository, soloEntriesStore, wordsRepository, lobbyClient, getSession } =
    Route.useRouteContext();
  return (
    <HomeScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      wordsRepository={wordsRepository}
      lobbyClient={lobbyClient}
      getSession={getSession}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: '/',
  component: V2IndexComponent,
});
