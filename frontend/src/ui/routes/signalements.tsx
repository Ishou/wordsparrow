// `/signalements` eager half — route definition + head(); lazy UI in `./signalements.lazy`.

import { createRoute } from '@tanstack/react-router';
import { buildHead, SITE_BASE_URL } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { GateLoadingScreen } from '@/ui/v2/GateLoadingScreen';
import { Route as RootRoute } from './__root';

// Neutral loader during the lazy-chunk fetch: shows no signalements heading/chrome so the route never leaks to a non-eligible visitor before the gate resolves.
function SignalementsPending() {
  return <GateLoadingScreen backTo="/" />;
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/signalements',
  pendingMs: 0,
  pendingComponent: SignalementsPending,
  head: () =>
    buildHead({
      title: t('seo.noindex.signalements.title'),
      description: t('seo.noindex.signalements.description'),
      canonical: `${SITE_BASE_URL}/signalements`,
      noindex: true,
    }),
}).lazy(() => import('./signalements.lazy').then((m) => m.Route));

// Historique is its own route so F5 / deep-links stay on the handled-report tab (mirrors the /grilles per-tab routes).
export const HistoriqueRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/signalements/historique',
  pendingMs: 0,
  pendingComponent: SignalementsPending,
  head: () =>
    buildHead({
      title: t('seo.noindex.signalements.title'),
      description: t('seo.noindex.signalements.description'),
      canonical: `${SITE_BASE_URL}/signalements/historique`,
      noindex: true,
    }),
}).lazy(() => import('./signalements.lazy').then((m) => m.HistoriqueRoute));
