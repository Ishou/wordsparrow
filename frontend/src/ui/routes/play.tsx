import { createRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { Puzzle } from '@/domain';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { PlayScreen } from '@/ui/play/PlayScreen';
import { Route as V2Route } from './v2';

const notice = css({ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', fontFamily: 'wsUi', fontSize: '15px', color: 'ws.jadeInk', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)' });

// Dev-only route served by MSW under `pnpm dev:preview`; plain `pnpm dev` has no grid-api, so this hint shows.
function PlayUnavailable() {
  return (
    <main className={notice}>
      <p role="status">
        Grille indisponible. Lancez <code>pnpm dev:preview</code> pour activer les mocks&nbsp;(MSW).
      </p>
    </main>
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
  getParentRoute: () => V2Route,
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
});
