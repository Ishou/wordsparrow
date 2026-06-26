import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { DesignSystemGallery } from '@/design-system/gallery/DesignSystemGallery';
import { Route as V2Route } from './v2';

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'design-system',
  component: DesignSystemGallery,
});
