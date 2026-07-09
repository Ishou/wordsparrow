import { createRoute, redirect, useNavigate } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { GrillesArchiveScreen, type GrillesOnglet } from '@/ui/v2/GrillesArchiveScreen';
import { indexableHeadWithBreadcrumb, noindexHead } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

// Each tab is its own route so the prerender bakes the correct per-tab skeleton (a static file can't vary by query string). Internal onglet id `plusieurs` maps to the /multijoueur URL.
const ONGLET_PATHS: Record<GrillesOnglet, string> = {
  quotidiennes: '/grilles',
  'a-finir': '/grilles/a-finir',
  plusieurs: '/grilles/multijoueur',
};

function GrillesScreen({ onglet }: { readonly onglet: GrillesOnglet }) {
  const context = AppLayoutRoute.useRouteContext();
  const navigate = useNavigate();
  return (
    <GrillesArchiveScreen
      puzzleRepository={context.puzzleRepository}
      soloEntriesStore={context.soloEntriesStore}
      onglet={onglet}
      onOngletChange={(next) => navigate({ to: ONGLET_PATHS[next], replace: true })}
      // forward multiplayer adapters from context so the À plusieurs tab shows when the flag is on (undefined hides it)
      lobbyClient={context.lobbyClient}
      getSession={context.getSession}
      authClient={context.authClient}
      progressSyncService={context.progressSyncService}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles',
  // Legacy `?onglet=a-finir|plusieurs` deep links (pre-per-tab-routes) parse then redirect to the path form.
  validateSearch: (search: Record<string, unknown>): { onglet?: 'a-finir' | 'plusieurs' } =>
    search.onglet === 'a-finir' || search.onglet === 'plusieurs' ? { onglet: search.onglet } : {},
  beforeLoad: ({ search }) => {
    if (search.onglet === 'a-finir') throw redirect({ to: '/grilles/a-finir', replace: true });
    if (search.onglet === 'plusieurs') throw redirect({ to: '/grilles/multijoueur', replace: true });
  },
  component: () => <GrillesScreen onglet="quotidiennes" />,
  head: () => indexableHeadWithBreadcrumb('/grilles'),
});

// À finir / À plusieurs are personalized (your in-progress grids / your parties) — noindex, but still prerendered so each bakes its own loading skeleton.
export const AFinirRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles/a-finir',
  component: () => <GrillesScreen onglet="a-finir" />,
  head: () => noindexHead(t('seo.noindex.grillesAFinir.title'), t('seo.noindex.grillesAFinir.description')),
});

export const MultijoueurRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles/multijoueur',
  component: () => <GrillesScreen onglet="plusieurs" />,
  head: () => noindexHead(t('seo.noindex.grillesMultijoueur.title'), t('seo.noindex.grillesMultijoueur.description')),
});
