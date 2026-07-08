import { createRoute, useNavigate } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { GrillesArchiveScreen, type GrillesOnglet } from '@/ui/v2/GrillesArchiveScreen';
import { indexableHeadWithBreadcrumb } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

function GrillesRouteComponent() {
  // forward multiplayer adapters from context so the À plusieurs tab shows when the flag is on (undefined hides it)
  const { puzzleRepository, soloEntriesStore, lobbyClient, getSession, authClient } = Route.useRouteContext();
  const { onglet } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <GrillesArchiveScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      onglet={onglet ?? 'quotidiennes'}
      onOngletChange={(next) =>
        navigate({
          to: '/grilles',
          search: next === 'quotidiennes' ? {} : { onglet: next },
          replace: true,
        })
      }
      lobbyClient={lobbyClient}
      getSession={getSession}
      authClient={authClient}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grilles',
  // `?onglet=a-finir|plusieurs` selects a tab; absent = Quotidiennes.
  validateSearch: (search: Record<string, unknown>): { onglet?: Exclude<GrillesOnglet, 'quotidiennes'> } =>
    search.onglet === 'a-finir' || search.onglet === 'plusieurs' ? { onglet: search.onglet } : {},
  component: GrillesRouteComponent,
  head: () => indexableHeadWithBreadcrumb('/grilles'),
});
