import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { HomeScreen } from '@/ui/home/HomeScreen';
import { Route as RootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/home',
  component: HomeScreen,
});
