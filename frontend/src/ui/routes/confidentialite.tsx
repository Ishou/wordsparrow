import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ConfidentialiteScreen } from '@/ui/v2/ConfidentialiteScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

function ConfidentialiteRouteComponent() {
  return <ConfidentialiteScreen />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'confidentialite',
  component: ConfidentialiteRouteComponent,
  head: () => indexableHeadWithBreadcrumb('/confidentialite'),
});
