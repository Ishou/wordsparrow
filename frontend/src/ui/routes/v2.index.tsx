import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { HomeScreen } from '@/ui/home/HomeScreen';
import { Route as V2Route } from './v2';

function V2IndexComponent() {
  const { puzzleRepository, soloEntriesStore, wordsRepository } = Route.useRouteContext();
  return (
    <HomeScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      wordsRepository={wordsRepository}
    />
  );
}

// alias kept so /v2/home back-targets remain valid while sibling screens exist.
export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: '/',
  component: V2IndexComponent,
});
