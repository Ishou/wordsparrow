import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { DesignSystemGallery } from '@/design-system/gallery/DesignSystemGallery';
import { Route as AppLayoutRoute } from './app-layout';

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'design-system',
  component: DesignSystemGallery,
});
