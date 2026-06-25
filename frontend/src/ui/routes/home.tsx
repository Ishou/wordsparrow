import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { HomeScreen } from '@/ui/home/HomeScreen';
import { Route as RootRoute } from './__root';

function HomeRouteComponent() {
  const { puzzleRepository, soloEntriesStore } = Route.useRouteContext();
  return <HomeScreen puzzleRepository={puzzleRepository} soloEntriesStore={soloEntriesStore} />;
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/home',
  component: HomeRouteComponent,
});
