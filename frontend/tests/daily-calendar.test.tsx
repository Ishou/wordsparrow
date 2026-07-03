import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { DailySummary } from '@/application';
import { DailyCalendar, type DailyCalendarProps } from '@/ui/v2/DailyCalendar';
import { deriveDayInfos } from '@/ui/v2/dailyCalendarModel';
import { expectAxeClean } from '@/test/a11y';

function summary(date: string, id = date): DailySummary {
  return { id, date, gridNumber: 42, difficulty: null, totalLetterCells: 10 };
}

const TODAY = '2026-06-30';
const INFOS = deriveDayInfos(
  [summary('2026-06-29', 'done-d'), summary('2026-06-28', 'prog-d'), summary(TODAY, 'today-d'), summary('2026-06-01', 'old-d')],
  (id) =>
    id === 'done-d'
      ? { locked: 10, started: true }
      : id === 'prog-d'
        ? { locked: 3, started: true }
        : { locked: 0, started: false },
  TODAY,
  true,
);

function renderCalendar(over: Partial<DailyCalendarProps> = {}) {
  const props: DailyCalendarProps = {
    month: '2026-06',
    infos: INFOS,
    canPrev: true,
    canNext: false,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onPaywalledSelect: vi.fn(),
    ...over,
  };
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <DailyCalendar {...props} /> });
  const play = createRoute({
    getParentRoute: () => root,
    path: '/play',
    component: () => <div>play</div>,
    validateSearch: (s: Record<string, unknown>): { date?: string } => (typeof s.date === 'string' ? { date: s.date } : {}),
  });
  const router = createRouter({
    routeTree: root.addChildren([index, play]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { props, router, ...render(<RouterProvider router={router as never} />) };
}

describe('DailyCalendar', () => {
  it('labels playable days by status and navigates a past day to /play with its date', async () => {
    const { router } = renderCalendar();
    expect(await screen.findByRole('link', { name: 'Revoir — Lundi 29 juin' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Reprendre — Dimanche 28 juin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Reprendre — Dimanche 28 juin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(router.state.location.search).toEqual({ date: '2026-06-28' });
  });

  it('sends today to /play without a date param', async () => {
    const { router } = renderCalendar();
    fireEvent.click(await screen.findByRole('link', { name: 'Commencer — Mardi 30 juin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(router.state.location.search).toEqual({});
  });

  it('opens the paywall handler for a locked day instead of navigating', async () => {
    const { props } = renderCalendar();
    fireEvent.click(await screen.findByRole('button', { name: "Grille réservée à l'abonnement — Lundi 1 juin" }));
    expect(props.onPaywalledSelect).toHaveBeenCalledOnce();
  });

  it('renders days without a grid as non-interactive and clamps month nav', async () => {
    renderCalendar();
    await screen.findByRole('button', { name: 'Mois précédent' });
    expect(screen.queryByRole('link', { name: /15 juin/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /15 juin/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mois précédent' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderCalendar();
    await screen.findByRole('button', { name: 'Mois précédent' });
    await expectAxeClean(container);
  });
});
