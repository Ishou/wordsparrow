import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV until the v1→v2 cutover.
import { CompteScreen } from '@/ui/v2/CompteScreen';
import { Route as V2Route } from './v2';

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'compte',
  component: CompteScreen,
});
