# /grilles Calendar Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/grilles`' three status tabs with kind tabs — Quotidiennes (month calendar with per-day status), À finir (cross-archive in-progress list), À plusieurs (lobbies + create CTA).

**Architecture:** A pure calendar model module (`dailyCalendarModel.ts`) owns date math and status derivation; a presentational `DailyCalendar` renders it; `GrillesArchiveScreen` orchestrates tabs, a fetch-all-summaries loop (new application-layer helper), and the per-tab bodies. Route gains an optional `onglet` search param. No API change.

**Tech Stack:** React 19, TanStack Router, Panda CSS (`styled-system/css`), Vitest + Testing Library + vitest-axe, existing `PuzzleRepository`/`SoloEntriesStore`/`LobbyClient` ports.

**Spec:** `docs/superpowers/specs/2026-07-03-grilles-calendar-rework-design.md` — read it first; it fixes copy, paywall rules, and out-of-scope items.

## Global Constraints

- French copy uses **tutoiement**; no pressure wording on paywall surfaces (round, calm copy).
- Status never encoded by color alone; every interactive cell has a French aria-label.
- One-line comments only (no multi-line comment blocks); non-obvious WHY only.
- Commits: conventional, `-s` sign-off, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer, scope `frontend-grid` (route/test glue may use `frontend`).
- Paywall rule (unchanged, ADR-0080 W5a): `canSubscribe && !started && daysSince(date) > 7`.
- All commands run from `frontend/`. Local caveat: `tests/v2-grilles.test.tsx` fails 7/7 on pristine main locally (MenuSheet `useAuth` without provider; green in CI) — the rework replaces that harness with the real route tree + `AuthProvider`, which MUST pass locally.
- **No PR until the maintainer has seen the result running locally** (spec §Delivery).

---

### Task 1: Calendar model — pure date math + status derivation

**Files:**
- Create: `frontend/src/ui/v2/dailyCalendarModel.ts`
- Test: `frontend/tests/daily-calendar-model.test.ts`

**Interfaces:**
- Consumes: `DailySummary` from `@/application`.
- Produces (used by Tasks 3 & 5):

```ts
export type DayStatus = 'done' | 'progress' | 'new' | 'paywalled';
export interface DayInfo {
  readonly summary: DailySummary;
  readonly status: DayStatus;
  readonly locked: number;
  readonly today: boolean;
}
export interface CalendarCell { readonly iso: string; readonly dayOfMonth: number }
export function isoUtcDate(d: Date): string;                       // "YYYY-MM-DD"
export function longDateFr(iso: string): string;                   // "Jeudi 26 juin"
export function monthLabelFr(month: string): string;               // "Juin 2026" from "YYYY-MM"
export function monthOf(iso: string): string;                      // "2026-06-04" -> "2026-06"
export function prevMonth(month: string): string;
export function nextMonth(month: string): string;
export function monthGrid(month: string): ReadonlyArray<ReadonlyArray<CalendarCell | null>>; // Monday-first weeks, null = out of month
export function deriveDayInfos(
  summaries: ReadonlyArray<DailySummary>,
  progressOf: (summaryId: string) => { locked: number; started: boolean },
  todayIso: string,
  canSubscribe: boolean,
): ReadonlyMap<string, DayInfo>;                                   // keyed by ISO date
```

- [ ] **Step 1: Write the failing tests**

`frontend/tests/daily-calendar-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DailySummary } from '@/application';
import {
  deriveDayInfos,
  monthGrid,
  monthLabelFr,
  monthOf,
  nextMonth,
  prevMonth,
} from '@/ui/v2/dailyCalendarModel';

function summary(date: string, id = date): DailySummary {
  return { id, date, gridNumber: 1, difficulty: null, totalLetterCells: 10 };
}

describe('monthGrid', () => {
  it('lays out June 2026 Monday-first: starts on Monday, 30 days, 5 weeks', () => {
    const weeks = monthGrid('2026-06');
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ iso: '2026-06-01', dayOfMonth: 1 });
    expect(weeks[4][1]).toEqual({ iso: '2026-06-30', dayOfMonth: 30 });
    expect(weeks[4][2]).toBeNull();
  });

  it('pads a month that starts mid-week with leading nulls (July 2026 starts Wednesday)', () => {
    const weeks = monthGrid('2026-07');
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBeNull();
    expect(weeks[0][2]).toEqual({ iso: '2026-07-01', dayOfMonth: 1 });
  });
});

describe('month navigation', () => {
  it('steps months across year boundaries', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(monthOf('2026-06-04')).toBe('2026-06');
  });

  it('labels a month in French', () => {
    expect(monthLabelFr('2026-06')).toBe('Juin 2026');
  });
});

describe('deriveDayInfos', () => {
  const TODAY = '2026-07-03';

  it('derives done / progress / new from locked cells', () => {
    const infos = deriveDayInfos(
      [summary('2026-07-01', 'a'), summary('2026-07-02', 'b'), summary(TODAY, 'c')],
      (id) => (id === 'a' ? { locked: 10, started: true } : id === 'b' ? { locked: 4, started: true } : { locked: 0, started: false }),
      TODAY,
      false,
    );
    expect(infos.get('2026-07-01')?.status).toBe('done');
    expect(infos.get('2026-07-02')?.status).toBe('progress');
    expect(infos.get(TODAY)?.status).toBe('new');
    expect(infos.get(TODAY)?.today).toBe(true);
  });

  it('paywalls unstarted grids strictly older than 7 days, only for subscribable users', () => {
    const boundary = summary('2026-06-26', 'seven');  // exactly 7 days old
    const older = summary('2026-06-25', 'eight');     // 8 days old
    const none = (id: string) => ({ locked: 0, started: false });
    const asFree = deriveDayInfos([boundary, older], none, TODAY, true);
    expect(asFree.get('2026-06-26')?.status).toBe('new');
    expect(asFree.get('2026-06-25')?.status).toBe('paywalled');
    const asSubscriber = deriveDayInfos([boundary, older], none, TODAY, false);
    expect(asSubscriber.get('2026-06-25')?.status).toBe('new');
  });

  it('never paywalls a started grid', () => {
    const infos = deriveDayInfos([summary('2026-01-01')], () => ({ locked: 2, started: true }), TODAY, true);
    expect(infos.get('2026-01-01')?.status).toBe('progress');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/daily-calendar-model.test.ts`
Expected: FAIL — module `@/ui/v2/dailyCalendarModel` not found.

- [ ] **Step 3: Implement the model**

`frontend/src/ui/v2/dailyCalendarModel.ts` (date helpers move here from `GrillesArchiveScreen.tsx` so both share one source):

```ts
import type { DailySummary } from '@/application';

export type DayStatus = 'done' | 'progress' | 'new' | 'paywalled';

export interface DayInfo {
  readonly summary: DailySummary;
  readonly status: DayStatus;
  readonly locked: number;
  readonly today: boolean;
}

export interface CalendarCell {
  readonly iso: string;
  readonly dayOfMonth: number;
}

// UTC YYYY-MM-DD — matches DailySummary.date and the server's UTC clamp.
export function isoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "Jeudi 26 juin" from a UTC ISO date.
export function longDateFr(iso: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Juin 2026" from a YYYY-MM month key.
export function monthLabelFr(month: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return isoUtcDate(d).slice(0, 7);
}

export function prevMonth(month: string): string {
  return shiftMonth(month, -1);
}

export function nextMonth(month: string): string {
  return shiftMonth(month, 1);
}

// Monday-first weeks; null pads days outside the month.
export function monthGrid(month: string): ReadonlyArray<ReadonlyArray<CalendarCell | null>> {
  const first = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: Array<CalendarCell | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: `${month}-${String(day).padStart(2, '0')}`, dayOfMonth: day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<CalendarCell | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Whole-day age of an ISO date relative to today (both UTC midnight).
function daysSince(iso: string, todayIso: string): number {
  return Math.round((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);
}

export function deriveDayInfos(
  summaries: ReadonlyArray<DailySummary>,
  progressOf: (summaryId: string) => { locked: number; started: boolean },
  todayIso: string,
  canSubscribe: boolean,
): ReadonlyMap<string, DayInfo> {
  const out = new Map<string, DayInfo>();
  for (const summary of summaries) {
    const { locked, started } = progressOf(summary.id);
    const total = summary.totalLetterCells;
    const base: DayStatus = total > 0 && locked >= total ? 'done' : locked > 0 ? 'progress' : 'new';
    const status: DayStatus = base === 'new' && canSubscribe && !started && daysSince(summary.date, todayIso) > 7 ? 'paywalled' : base;
    out.set(summary.date, { summary, status, locked, today: summary.date === todayIso });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/daily-calendar-model.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/v2/dailyCalendarModel.ts frontend/tests/daily-calendar-model.test.ts
git commit -s -m "feat(frontend-grid): daily calendar model with status derivation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Fetch-all-summaries application helper

**Files:**
- Create: `frontend/src/application/puzzle/fetchAllDailySummaries.ts`
- Modify: `frontend/src/application/index.ts` (re-export; mirror how `PuzzleRepository` types are exported there)
- Test: `frontend/tests/fetch-all-daily-summaries.test.ts`

**Interfaces:**
- Consumes: `PuzzleRepository.listDailySummaries({ to })`, `DailySummariesPage`.
- Produces (used by Task 5): `fetchAllDailySummaries(repo: PuzzleRepository, todayIso: string): Promise<ReadonlyArray<DailySummary>>` — DESC-by-date, whole archive.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { DailySummariesPage, DailySummary, PuzzleRepository } from '@/application';
import { fetchAllDailySummaries } from '@/application';

function summary(date: string): DailySummary {
  return { id: date, date, gridNumber: 1, difficulty: null, totalLetterCells: 10 };
}

function pagedRepo(pages: DailySummariesPage[], calls: Array<string | undefined>): PuzzleRepository {
  return {
    fetchById: () => Promise.reject(new Error('unused')),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: (opts) => {
      calls.push(opts?.to);
      return Promise.resolve(pages[calls.length - 1]);
    },
  };
}

describe('fetchAllDailySummaries', () => {
  it('follows hasMore pages, re-anchoring to one day before the oldest item', async () => {
    const calls: Array<string | undefined> = [];
    const repo = pagedRepo(
      [
        { items: [summary('2026-07-03'), summary('2026-07-02')], hasMore: true },
        { items: [summary('2026-07-01')], hasMore: false },
      ],
      calls,
    );
    const all = await fetchAllDailySummaries(repo, '2026-07-03');
    expect(all.map((s) => s.date)).toEqual(['2026-07-03', '2026-07-02', '2026-07-01']);
    expect(calls).toEqual(['2026-07-03', '2026-07-01']);
  });

  it('stops on an empty page even if hasMore lies', async () => {
    const calls: Array<string | undefined> = [];
    const repo = pagedRepo([{ items: [], hasMore: true }], calls);
    expect(await fetchAllDailySummaries(repo, '2026-07-03')).toEqual([]);
  });
});
```

Note: the first `to` is today, and the follow-up `to` is the oldest received date **minus one day** (`2026-07-01`)... verify against the implementation below — the loop passes `dayBefore(oldest)`, so for oldest `2026-07-02` the second call is `to: '2026-07-01'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch-all-daily-summaries.test.ts`
Expected: FAIL — `fetchAllDailySummaries` is not exported.

- [ ] **Step 3: Implement**

`frontend/src/application/puzzle/fetchAllDailySummaries.ts`:

```ts
import type { DailySummary, PuzzleRepository } from './PuzzleRepository';

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Walks the archive back to the server's launch anchor (100 items/page cap).
export async function fetchAllDailySummaries(
  repo: PuzzleRepository,
  todayIso: string,
): Promise<ReadonlyArray<DailySummary>> {
  const all: DailySummary[] = [];
  let to = todayIso;
  for (;;) {
    const page = await repo.listDailySummaries({ to });
    all.push(...page.items);
    if (!page.hasMore || page.items.length === 0) return all;
    to = dayBefore(page.items[page.items.length - 1].date);
  }
}
```

Add the re-export in `frontend/src/application/index.ts` next to the existing puzzle exports:

```ts
export { fetchAllDailySummaries } from './puzzle/fetchAllDailySummaries';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch-all-daily-summaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/puzzle/fetchAllDailySummaries.ts frontend/src/application/index.ts frontend/tests/fetch-all-daily-summaries.test.ts
git commit -s -m "feat(frontend-grid): fetch the full daily-summary archive across pages" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: DailyCalendar component

**Files:**
- Create: `frontend/src/ui/v2/DailyCalendar.tsx`
- Test: `frontend/tests/daily-calendar.test.tsx`

**Interfaces:**
- Consumes (Task 1): `monthGrid`, `monthLabelFr`, `longDateFr`, `DayInfo`, `CalendarCell`.
- Produces (used by Task 5):

```tsx
export interface DailyCalendarProps {
  readonly month: string;                          // YYYY-MM being viewed
  readonly infos: ReadonlyMap<string, DayInfo>;    // keyed by ISO date
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onPaywalledSelect: () => void;          // screen opens AbonnementSheet
}
export function DailyCalendar(props: DailyCalendarProps): JSX.Element;
```

**Rendering contract:**
- Header row: `◀` button (aria-label "Mois précédent", disabled when `!canPrev`), `monthLabelFr(month)` as an `h2`, `▶` button (aria-label "Mois suivant", disabled when `!canNext`). Use `CaretLeft`/`CaretRight` from `@phosphor-icons/react`.
- Weekday header `L M M J V S D` (aria-hidden; full day names live in cell labels).
- 7-column CSS grid. Out-of-month cells: empty placeholders. Days without a `DayInfo` (future or pre-launch): the day number, muted, non-interactive (`<span>`).
- Cell visuals, all rounded squares ~40px (never color-only — fill/ring/mute differ structurally):
  - `done`: filled `#4F6E5C`, white day number.
  - `progress`: white bg, 2.5px `ws.sakuraDark` ring, jadeInk number.
  - `new`: white bg, 1.5px `rgba(33,75,64,0.18)` outline, jadeInk number.
  - `paywalled`: `rgba(255,255,255,0.55)` bg, no outline, khaki number at full cell opacity 0.7 — no padlock glyph.
  - `today`: additional 2px offset ring in `ws.sakuraDark` + bolder number.
- Playable cells (`done`/`progress`/`new`): TanStack `Link` `to="/play"`, `search={info.today ? undefined : { date: iso }}`, aria-label `` `${actionLabel} — ${longDateFr(iso)}` `` with actionLabel Revoir/Reprendre/Commencer (same mapping as today's screen).
- Paywalled cells: `<button>` calling `onPaywalledSelect`, aria-label `` `Grille réservée à l'abonnement — ${longDateFr(iso)}` ``.
- Legend below the grid, one line, small khaki text: `● terminée · ◍ en cours · ○ à jouer · grilles plus anciennes réservées à l'abonnement` rendered as swatch spans (aria-hidden) + text.
- Focus visible: `outline: 3px solid token(colors.ws.sakuraRose)` on `_focusVisible` (house style).

- [ ] **Step 1: Write the failing tests**

`frontend/tests/daily-calendar.test.tsx` — render inside a memory router (pattern from the current `tests/v2-grilles.test.tsx` `renderScreen`, routes `/` and `/play`):

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
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
  (id) => (id === 'done-d' ? { locked: 10, started: true } : id === 'prog-d' ? { locked: 3, started: true } : { locked: 0, started: false }),
  TODAY,
  true,
);

function renderCalendar(over: Partial<DailyCalendarProps> = {}) {
  const props: DailyCalendarProps = {
    month: '2026-06', infos: INFOS, canPrev: true, canNext: false,
    onPrev: vi.fn(), onNext: vi.fn(), onPaywalledSelect: vi.fn(), ...over,
  };
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <DailyCalendar {...props} /> });
  const play = createRoute({
    getParentRoute: () => root, path: '/play', component: () => <div>play</div>,
    validateSearch: (s: Record<string, unknown>): { date?: string } => (typeof s.date === 'string' ? { date: s.date } : {}),
  });
  const router = createRouter({ routeTree: root.addChildren([index, play]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  return { props, router, ...render(<RouterProvider router={router as never} />) };
}

describe('DailyCalendar', () => {
  it('labels playable days by status and navigates a past day to /play with its date', async () => {
    const { router } = renderCalendar();
    expect(screen.getByRole('link', { name: 'Revoir — Lundi 29 juin' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Reprendre — Dimanche 28 juin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Reprendre — Dimanche 28 juin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(router.state.location.search).toEqual({ date: '2026-06-28' });
  });

  it('sends today to /play without a date param', async () => {
    const { router } = renderCalendar();
    fireEvent.click(screen.getByRole('link', { name: 'Commencer — Mardi 30 juin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(router.state.location.search).toEqual({});
  });

  it('opens the paywall handler for a locked day instead of navigating', () => {
    const { props } = renderCalendar();
    fireEvent.click(screen.getByRole('button', { name: "Grille réservée à l'abonnement — Lundi 1 juin" }));
    expect(props.onPaywalledSelect).toHaveBeenCalledOnce();
  });

  it('renders days without a grid as non-interactive and clamps month nav', () => {
    renderCalendar();
    // 2026-06-15 has no summary: present as text, not link/button.
    expect(screen.queryByRole('link', { name: /15 juin/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mois précédent' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderCalendar();
    await expectAxeClean(container);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/daily-calendar.test.tsx`
Expected: FAIL — `DailyCalendar` not found.

- [ ] **Step 3: Implement `DailyCalendar.tsx`**

Follow the rendering contract above. Skeleton:

```tsx
import { Link } from '@tanstack/react-router';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { longDateFr, monthGrid, monthLabelFr, type DayInfo } from './dailyCalendarModel';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function actionLabel(status: DayInfo['status']): string {
  if (status === 'done') return 'Revoir';
  if (status === 'progress') return 'Reprendre';
  return 'Commencer';
}

export interface DailyCalendarProps { /* as in Interfaces block */ }

export function DailyCalendar({ month, infos, canPrev, canNext, onPrev, onNext, onPaywalledSelect }: DailyCalendarProps) {
  return (
    <div>
      <div className={header}>
        <button type="button" aria-label="Mois précédent" disabled={!canPrev} onClick={onPrev} className={navBtn}>
          <CaretLeft size={18} weight="bold" aria-hidden="true" />
        </button>
        <h2 className={monthTitle}>{monthLabelFr(month)}</h2>
        <button type="button" aria-label="Mois suivant" disabled={!canNext} onClick={onNext} className={navBtn}>
          <CaretRight size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className={weekdayRow} aria-hidden="true">{WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
      {monthGrid(month).map((week, wi) => (
        <div key={wi} className={weekRow}>
          {week.map((cell, ci) => {
            if (cell == null) return <span key={ci} className={cellBlank} />;
            const info = infos.get(cell.iso);
            if (info == null) return <span key={ci} className={cx(cellBase, cellVoid)}>{cell.dayOfMonth}</span>;
            if (info.status === 'paywalled') {
              return (
                <button key={ci} type="button" className={cx(cellBase, cellPaywalled)} onClick={onPaywalledSelect}
                  aria-label={`Grille réservée à l'abonnement — ${longDateFr(cell.iso)}`}>
                  {cell.dayOfMonth}
                </button>
              );
            }
            return (
              <Link key={ci} to="/play" search={info.today ? undefined : { date: cell.iso }}
                className={cx(cellBase, byStatus[info.status], info.today && cellToday)}
                aria-label={`${actionLabel(info.status)} — ${longDateFr(cell.iso)}`}>
                {cell.dayOfMonth}
              </Link>
            );
          })}
        </div>
      ))}
      <p className={legend}>{/* legend spans per rendering contract */}</p>
    </div>
  );
}
```

Style with `css()` blocks per the rendering contract (house style: `wsUi` font, `ws.*` tokens, `_focusVisible` sakuraRose outline). Use CSS grid `gridTemplateColumns: 'repeat(7, 1fr)'` for `weekdayRow`/`weekRow`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/daily-calendar.test.tsx`
Expected: PASS. If the axe check flags contrast on cell states, adjust colors (khaki ≥ 0.85 opacity rule; `ws.sakuraDark` over sakura) and re-run.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/v2/DailyCalendar.tsx frontend/tests/daily-calendar.test.tsx
git commit -s -m "feat(frontend-grid): daily calendar component with status cells" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Lobbies section heading removal + lobbies empty state

**Files:**
- Modify: `frontend/src/ui/v2/GrillesLobbiesSection.tsx` (drop the internal `h2` + early-null; render just the card list `<ul>`; keep the file name/export)
- Modify: `frontend/src/ui/v2/GrillesEmptyState.tsx` (export a new `LobbiesEmptyState`)
- Test: `frontend/tests/v2-grilles-lobbies.test.tsx` (update: no heading; add empty-state test)

**Interfaces:**
- Produces (used by Task 5):
  - `GrillesLobbiesSection({ lobbies })` — now renders only the `<ul>` card list; renders `null` when empty stays REMOVED (Task 5 decides emptiness).
  - `LobbiesEmptyState({ onCreate }: { readonly onCreate: () => void })` — SparrowState with nest scene, title `Aucune partie à plusieurs`, body `Crée une partie et invite tes proches — vous remplissez la même grille ensemble.`, CTA `Créer une partie`.

- [ ] **Step 1: Update/write the failing tests**

In `tests/v2-grilles-lobbies.test.tsx`: remove/replace any assertion on the `Parties à plusieurs` heading (grep it); add:

```tsx
it('renders the empty state CTA when there are no lobbies', () => {
  const onCreate = vi.fn();
  render(<LobbiesEmptyState onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Créer une partie' }));
  expect(onCreate).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/v2-grilles-lobbies.test.tsx`
Expected: FAIL — `LobbiesEmptyState` not exported; heading assertions (if updated first) fail against old markup.

- [ ] **Step 3: Implement both changes**

`GrillesLobbiesSection`: delete the `if (lobbies.length === 0) return null;` guard, the `<section>`/`<h2>` wrapper and `label` style; return the `<ul className={list}>…</ul>` directly.

`GrillesEmptyState.tsx` — append:

```tsx
export function LobbiesEmptyState({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <SparrowState
      scene={nestScene}
      title="Aucune partie à plusieurs"
      body="Crée une partie et invite tes proches — vous remplissez la même grille ensemble."
      cta={{ label: 'Créer une partie', onClick: onCreate }}
      as="p"
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/v2-grilles-lobbies.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/v2/GrillesLobbiesSection.tsx frontend/src/ui/v2/GrillesEmptyState.tsx frontend/tests/v2-grilles-lobbies.test.tsx
git commit -s -m "refactor(frontend-grid): headless lobbies list and lobbies empty state" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Screen rework — kind tabs, fetch-all, per-tab bodies, `onglet` param

**Files:**
- Modify: `frontend/src/ui/v2/GrillesArchiveScreen.tsx` (major rework)
- Modify: `frontend/src/ui/routes/grilles.tsx` (`validateSearch` + wire `onglet`, `authClient`)
- Rewrite: `frontend/tests/v2-grilles.test.tsx` (new harness: real route tree + AuthProvider, per `tests/compte-abonnement.test.tsx`)

**Interfaces:**
- Consumes: Tasks 1–4 exports; `fetchAllDailySummaries`; `HostSignInSheet` from `@/ui/home/HostSignInSheet` (check the actual import path with grep before using); `LobbyClientError` from `@/application/game`.
- Produces:

```tsx
export type GrillesOnglet = 'quotidiennes' | 'a-finir' | 'plusieurs';
export function GrillesArchiveScreen(props: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly onglet: GrillesOnglet;
  readonly onOngletChange: (o: GrillesOnglet) => void;
  readonly lobbyClient?: LobbyClient;
  readonly getSession?: () => AppSession;          // {sessionId, pseudonym} — createLobby needs both
  readonly authClient?: AuthClient;                // ADR-0083 expired-session net
}): JSX.Element;
```

**Behavior contract:**
- SegmentedControl options: `[{id:'quotidiennes', label:'Quotidiennes'}, {id:'a-finir', label:'À finir'}, {id:'plusieurs', label:'À plusieurs'}]`; the `plusieurs` option is omitted when `lobbyClient`/`getSession` are absent (and if the URL says `plusieurs` while unavailable, fall back to rendering `quotidiennes`).
- Data: one effect calls `fetchAllDailySummaries(puzzleRepository, todayIso)`; keep the 200 ms skeleton gate. `deriveDayInfos` in a `useMemo` with `progressOf = (id) => ({ locked: soloEntriesStore.loadLockedCells(id).length, started: soloEntriesStore.loadLockedCells(id).length > 0 || soloEntriesStore.load(id).length > 0 })`.
- Quotidiennes body: `DailyCalendar` with `month` state (init `monthOf(todayIso)`), `canPrev = month > monthOf(oldest summary date)`, `canNext = month < monthOf(todayIso)`, `onPaywalledSelect` opens the existing `AbonnementSheet` (`context: 'grid'`); `ArchiveUpsellBanner` below when `canSubscribe`; skeleton = 7×5 grid of `Skeleton` squares; error/empty (no summaries) = existing `GrillesEmptyState filter="new"`.
- À finir body: rows where `status === 'progress'`, newest first, reusing the existing card/Link markup (title `longDateFr · n°`, meta `En cours · x / y cases`, progress bar, chevron); empty = `GrillesEmptyState filter="progress"`.
- À plusieurs body: lobbies fetch as today (`listMyLobbies` when adapters present); non-empty → `GrillesLobbiesSection`; empty → `LobbiesEmptyState onCreate={createParty}` plus a text `Link` below to `/` labeled `Rejoindre avec un code`. `createParty` mirrors `HomeScreen` (`frontend/src/ui/home/HomeScreen.tsx:214-225`): pending guard, `lobbyClient.createLobby({ ownerSessionId, ownerPseudonym })`, navigate to `/lobby/$lobbyId`, on `LobbyClientError` `unauthorized` open `HostSignInSheet`.
- Route `grilles.tsx`: `validateSearch: (s) => (s.onglet === 'a-finir' || s.onglet === 'plusieurs' ? { onglet: s.onglet } : {})`; component reads `Route.useSearch()`, maps absent → `'quotidiennes'`, and `onOngletChange` does `navigate({ to: '/grilles', search: o === 'quotidiennes' ? {} : { onglet: o }, replace: true })`. Pass `authClient` from route context.
- Dead code: delete the old `Filter`/`FILTERS`, month-bucket grouping, `loadMore`/`floor`/`hasMore` state, and the date helpers that moved to the model. `GrillesEmptyState`'s `'done'` copy entry becomes unused — remove the `'done'` key and narrow its prop type to `'new' | 'progress'`.

- [ ] **Step 1: Rewrite `tests/v2-grilles.test.tsx` (failing first)**

New harness (compte pattern): real `RootRoute`→`AppLayoutRoute`→`GrillesRoute` tree, `AuthProvider` wrapper, full router context (copy the context object from `tests/compte-abonnement.test.tsx`, overriding `puzzleRepository`, `soloEntriesStore`, and adding `lobbyClient`/`getSession` where the test needs them), `initialEntries: ['/grilles']`. Cover:

1. Skeleton while in flight → calendar cells after resolve (find `link {name: /Commencer — /}`).
2. Multi-page archive: repo returning `hasMore: true` then a second page; oldest month reachable via ◀ and ◀ disables there; ▶ disabled on current month.
3. Status cells: done/progress/new aria-labels for seeded summaries (reuse `LOCKED` map idea from the old file).
4. Paywalled day (unstarted, >7 days, `canSubscribe` true via `whoami` capabilities `['billing:subscribe']`): clicking the cell opens the AbonnementSheet (assert its dialog/heading appears), no navigation.
5. `?onglet=a-finir` deep link renders the in-progress card list (progress bar + `En cours · 8 / 14 cases`); clicking `Quotidiennes` tab updates `router.state.location.search` to `{}`.
6. À plusieurs tab with a lobby: card listed; without lobbies: `Créer une partie` CTA calls `createLobby` and navigates to `/lobby/$lobbyId` (fake `createLobby` resolving `{ id: 'lob-1', … }`); without `lobbyClient`: only 2 tabs rendered.
7. Axe-clean once loaded.

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/v2-grilles.test.tsx`
Expected: FAIL — screen lacks `onglet` props / calendar.

- [ ] **Step 3: Implement screen + route rework**

Per the behavior contract. Keep `PhoneShell`/`MobileTopBar`/`MenuSheet`/`AbonnementSheet` wiring exactly as today.

- [ ] **Step 4: Run the full affected suite**

Run: `npx vitest run tests/v2-grilles.test.tsx tests/v2-grilles-lobbies.test.tsx tests/daily-calendar.test.tsx tests/daily-calendar-model.test.ts tests/fetch-all-daily-summaries.test.ts tests/seo-route-head.test.tsx`
Expected: PASS. Then `pnpm typecheck` — clean. Then `pnpm lint` if configured (check `package.json` scripts) — clean on touched files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/v2/GrillesArchiveScreen.tsx frontend/src/ui/v2/GrillesEmptyState.tsx frontend/src/ui/routes/grilles.tsx frontend/tests/v2-grilles.test.tsx
git commit -s -m "feat(frontend-grid): calendar and kind tabs on the grilles archive" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Local demo gate (no commit; blocks any PR)

**Files:** none (verification only).

- [ ] **Step 1: Run the app locally**

From `frontend/`: `pnpm dev` (or repo-root `make dev` if the API is needed; the archive endpoint must respond — if no local API, run with MSW/dev fixtures if the dev server provides them; otherwise `make dev`).

- [ ] **Step 2: Drive the real flow in a browser**

Visit `/grilles`: check calendar render, month nav clamps, today ring, status cells, paywall tap → sheet, `?onglet=a-finir` list, À plusieurs empty state. Take screenshots (mobile viewport 390×844 and desktop) — the mockup-verify rule: visually compare against the serene-naturalist v2 direction, not just structure.

- [ ] **Step 3: Show the maintainer**

Post screenshots + how to reproduce in the session. **Wait for their go-ahead before any PR.** Then split into the 2 PRs per spec §Delivery (Tasks 1–3 = PR 1; Tasks 4–5 = PR 2) — cap-override with justification if PR 2 exceeds 400 lines.
