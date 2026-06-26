import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { ConfidentialiteScreen } from '@/ui/v2/ConfidentialiteScreen';
import { Route as V2Route } from './v2';

function ConfidentialiteRouteComponent() {
  const { sessionClient } = Route.useRouteContext();
  return <ConfidentialiteScreen sessionClient={sessionClient} />;
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'confidentialite',
  component: ConfidentialiteRouteComponent,
});
