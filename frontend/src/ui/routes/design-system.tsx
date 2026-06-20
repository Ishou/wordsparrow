import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { DesignSystemGallery } from '@/design-system/gallery/DesignSystemGallery';
import { Route as RootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/design-system',
  component: DesignSystemGallery,
});
