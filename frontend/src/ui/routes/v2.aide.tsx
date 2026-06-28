import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { AideScreen } from '@/ui/v2/AideScreen';
import { Route as V2Route } from './v2';

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'aide',
  component: AideScreen,
});
