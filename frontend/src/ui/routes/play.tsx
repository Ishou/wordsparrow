import { createRoute, useNavigate } from '@tanstack/react-router';
import type { Puzzle } from '@/domain';
// Sanctioned app→module bridge (ADR-0072).
import { PlayScreen } from '@/ui/play/PlayScreen';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { SparrowState } from '@/ui/v2/SparrowState';
import { INDEXABLE_ROUTES, SITE_BASE_URL, breadcrumbJsonLd, gameJsonLd, indexableHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

// Rising sun on the horizon with a sparrow above — the daily "bientôt" state.
const sunriseScene = (
  <svg width="150" height="120" viewBox="0 0 150 120" role="img" aria-label="Un lever de soleil">
    <defs>
      <symbol id="puBird" viewBox="0 0 64 64">
        <path d="M9 30 L24 33 L20 44 Z" fill="#214B40" />
        <path d="M22 44 C16 41 16 30 21 24 C26 18 35 17 42 21 C46 23 49 27 49 31 L57 29 L49 34 C49 41 43 47 35 47 C30 47 25 46 22 44 Z" fill="#D45D83" />
        <path d="M28 30 C35 29 41 33 42 40 C35 41 29 38 28 30 Z" fill="#BE4970" />
        <path d="M24 42 C27 45 32 45 36 44 C33 47 27 47 24 42 Z" fill="#F6C9D7" />
        <path d="M49 30 L58 31.5 L49 33.5 Z" fill="#D8C77A" />
        <circle cx="44.5" cy="29.5" r="2.4" fill="#fff" />
        <circle cx="45" cy="29.7" r="1.3" fill="#214B40" />
      </symbol>
    </defs>
    <path d="M33 82 A42 42 0 0 1 117 82 Z" fill="#F6C98C" opacity="0.18" />
    <path d="M51 82 A24 24 0 0 1 99 82 Z" fill="#F6C98C" />
    <line x1="8" y1="82" x2="142" y2="82" stroke="#C4E5D3" strokeWidth="3" strokeLinecap="round" />
    <use href="#puBird" x="90" y="28" width="40" height="40" transform="rotate(-8 110 48)" />
  </svg>
);

// No puzzle: the daily isn't generated yet (ADR-0042 → 404), or plain `pnpm dev` has no grid-api (run `pnpm dev:preview` for MSW).
function PlayUnavailable() {
  const navigate = useNavigate();
  return (
    <PhoneShell>
      <SparrowState
        scene={sunriseScene}
        title="Bientôt disponible"
        body="La grille du jour se prépare. Elle arrive au lever du soleil."
        cta={{ label: 'Voir les grilles passées', onClick: () => void navigate({ to: '/grilles' }) }}
      />
    </PhoneShell>
  );
}

function PlayRouteComponent() {
  const puzzle = Route.useLoaderData() as Puzzle | null;
  const { puzzleSolver, soloEntriesStore } = Route.useRouteContext();
  if (!puzzle) return <PlayUnavailable />;
  return <PlayScreen puzzle={puzzle} puzzleSolver={puzzleSolver} soloEntriesStore={soloEntriesStore} />;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'play',
  // `?date=YYYY-MM-DD` opens that day's grid; any other value resolves to "today".
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === 'string' && ISO_DATE.test(search.date) ? { date: search.date } : {},
  loaderDeps: ({ search }) => ({
    date: typeof search.date === 'string' && ISO_DATE.test(search.date) ? search.date : undefined,
  }),
  loader: ({ context, deps }): Promise<Puzzle | null> => context.puzzleRepository.fetchDaily(deps.date),
  component: PlayRouteComponent,
  errorComponent: PlayUnavailable,
  head: () => {
    const r = INDEXABLE_ROUTES.find((x) => x.path === '/play')!;
    return {
      ...indexableHead('/play'),
      scripts: [
        {
          type: 'application/ld+json',
          children: breadcrumbJsonLd([
            { name: 'Accueil', item: `${SITE_BASE_URL}/` },
            { name: r.title, item: `${SITE_BASE_URL}/play` },
          ]),
        },
        {
          type: 'application/ld+json',
          children: gameJsonLd({
            name: 'WordSparrow — mots fléchés du jour',
            description:
              'Grille de mots fléchés française quotidienne, jouable en ligne sans inscription.',
            url: `${SITE_BASE_URL}/play`,
          }),
        },
      ],
    };
  },
});
