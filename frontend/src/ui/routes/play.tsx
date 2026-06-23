import { createRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { Puzzle } from '@/domain';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { PlayScreen } from '@/ui/play/PlayScreen';
import { Route as RootRoute } from './__root';

const notice = css({ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', fontFamily: 'wsUi', fontSize: '15px', color: 'ws.jadeInk', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)' });

// Dev-only route: the real grid ports back it, served by MSW under
// `pnpm dev:preview` (VITE_MOCK_GRID_API=true). Plain `pnpm dev` has no
// grid-api, so the loader resolves null / throws and this hint shows.
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

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/play',
  loader: ({ context }): Promise<Puzzle | null> => context.puzzleRepository.fetchDaily(undefined),
  component: PlayRouteComponent,
  errorComponent: PlayUnavailable,
});
