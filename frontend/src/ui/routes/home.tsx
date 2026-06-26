import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { HomeScreen } from '@/ui/home/HomeScreen';
import { Route as V2Route } from './v2';

function HomeRouteComponent() {
  const { puzzleRepository, soloEntriesStore, wordsRepository } = Route.useRouteContext();
  return (
    <HomeScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      wordsRepository={wordsRepository}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'home',
  component: HomeRouteComponent,
});
