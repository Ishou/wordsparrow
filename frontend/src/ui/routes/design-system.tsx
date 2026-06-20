import { createRoute } from '@tanstack/react-router';
// The sanctioned bridge from the app into the standalone v2 module (ADR-0072):
// a dev-only gallery, registered only when import.meta.env.DEV in router.ts.
import { DesignSystemGallery } from '@/design-system/gallery/DesignSystemGallery';
import { Route as RootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/design-system',
  component: DesignSystemGallery,
});
