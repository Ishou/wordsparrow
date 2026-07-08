import { createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { HomeScreen } from '@/ui/home/HomeScreen';
import { INDEXABLE_ROUTES, SITE_BASE_URL, indexableHead, organizationJsonLd } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

function HomeRouteComponent() {
  // forward multiplayer adapters from context so HomeScreen shows co-op + join when the flag is on (undefined hides them)
  const { puzzleRepository, soloEntriesStore, wordsRepository, lobbyClient, getSession } =
    Route.useRouteContext();
  return (
    <HomeScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      wordsRepository={wordsRepository}
      lobbyClient={lobbyClient}
      getSession={getSession}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: '/',
  component: HomeRouteComponent,
  head: () => {
    const r = INDEXABLE_ROUTES.find((x) => x.path === '/')!;
    return {
      ...indexableHead('/'),
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'WordSparrow',
            url: `${SITE_BASE_URL}/`,
            description: r.description,
            applicationCategory: 'GameApplication',
            inLanguage: 'fr',
          }),
        },
        {
          type: 'application/ld+json',
          children: organizationJsonLd({
            name: 'WordSparrow',
            url: `${SITE_BASE_URL}/`,
            logo: `${SITE_BASE_URL}/icon-512.png`,
          }),
        },
      ],
    };
  },
});
