import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { MentionsLegalesScreen } from '@/ui/v2/MentionsLegalesScreen';
import { Route as V2Route } from './v2';

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'mentions-legales',
  component: MentionsLegalesScreen,
});
