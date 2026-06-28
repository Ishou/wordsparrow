import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ReglagesScreen } from '@/ui/v2/ReglagesScreen';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'reglages',
  component: ReglagesScreen,
});
