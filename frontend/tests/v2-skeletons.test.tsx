import { act, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Puzzle } from '@/domain';
import type {
  DailySummariesPage,
  PuzzleRepository,
  SampleWord,
  WordsRepository,
} from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Skeleton } from '@/design-system';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { TeaserWord } from '@/ui/home/TeaserWord';
import { expectAxeClean } from '@/test/a11y';

const stubPuzzle: Puzzle = {
  id: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  title: 't',
  language: 'fr',
  width: 1,
  height: 1,
  gridNumber: 42,
  hintsAllowed: 3,
  hintsRemaining: 3,
  cells: [{ kind: 'letter', position: { row: 0, col: 0 }, entry: '' }],
};

const SAMPLE: ReadonlyArray<SampleWord> = [{ clue: 'Astre', answer: 'LUNE' }];

const emptyPage: DailySummariesPage = { items: [], hasMore: false };

const soloStore: SoloEntriesStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: () => [],
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
  clearForPuzzle: () => {},
} as unknown as SoloEntriesStore;

// A promise we can resolve on demand so the loading state is observable.
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderInRouter(node: ReactNode) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => node });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe('Skeleton primitive', () => {
  it('renders an aria-hidden block', () => {
    const { container } = render(<Skeleton width={40} height={12} />);
    const block = container.querySelector('span');
    expect(block?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is a11y clean inside a busy region', async () => {
    const { container } = render(
      <div role="status" aria-busy="true" aria-label="Chargement">
        <Skeleton width={40} height={12} />
        <Skeleton circle width={30} height={30} />
      </div>,
    );
    await expectAxeClean(container);
  });
});

describe('TeaserWord loading state', () => {
  it('shows skeletons in a busy region, then the real word once data lands', async () => {
    const d = deferred<ReadonlyArray<SampleWord>>();
    const wordsRepository: WordsRepository = { fetchSampleWords: () => d.promise };

    const { container } = render(<TeaserWord wordsRepository={wordsRepository} />);

    const busy = screen.getByLabelText('Chargement du mot du jour');
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    await expectAxeClean(container);

    await act(async () => {
      d.resolve(SAMPLE);
      await d.promise;
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Chargement du mot du jour')).toBeNull();
    });
    expect(screen.getByText('Astre')).toBeTruthy();
  });
});

describe('HomeScreen loading states', () => {
  it('skeletons the hero + day-strip while fetching, then swaps to real content', async () => {
    const daily = deferred<Puzzle | null>();
    const summaries = deferred<DailySummariesPage>();
    const puzzleRepository: PuzzleRepository = {
      fetchById: vi.fn().mockResolvedValue(stubPuzzle),
      fetchDaily: () => daily.promise,
      listDailySummaries: () => summaries.promise,
    };
    const wordsRepository: WordsRepository = {
      fetchSampleWords: vi.fn().mockResolvedValue(SAMPLE),
    };

    const { container } = renderInRouter(
      <HomeScreen
        puzzleRepository={puzzleRepository}
        soloEntriesStore={soloStore}
        wordsRepository={wordsRepository}
      />,
    );

    await screen.findByLabelText('Chargement de la grille du jour');
    // Day-strip card carries aria-busy while summaries are in flight.
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    await expectAxeClean(container);

    await act(async () => {
      daily.resolve(stubPuzzle);
      summaries.resolve(emptyPage);
      await daily.promise;
      await summaries.promise;
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Chargement de la grille du jour')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Jouer' })).toBeTruthy();
  });
});
