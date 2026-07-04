import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ConnexionScreen } from '@/ui/v2/ConnexionScreen';
import { Route as AppLayoutRoute } from './app-layout';

function ConnexionRouteComponent() {
  const { returnTo } = Route.useSearch();
  return <ConnexionScreen returnTo={returnTo ?? '/'} />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'connexion',
  // `?returnTo=` is honoured only for same-origin internal paths so a crafted absolute URL can't open-redirect after sign-in.
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === 'string' && search.returnTo.startsWith('/') && !search.returnTo.startsWith('//')
      ? { returnTo: search.returnTo }
      : {},
  component: ConnexionRouteComponent,
  // Title (a11y) + robots-noindex only while dark; the full noindex head + prerender shell land in the manifest with the bright release (ADR-0091 Wave 5).
  head: () => ({
    meta: [
      { title: 'Connexion — WordSparrow' },
      { name: 'robots', content: 'noindex,follow' },
    ],
  }),
});
