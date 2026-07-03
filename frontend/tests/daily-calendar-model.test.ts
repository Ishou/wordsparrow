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
      (id) =>
        id === 'a'
          ? { locked: 10, started: true }
          : id === 'b'
            ? { locked: 4, started: true }
            : { locked: 0, started: false },
      TODAY,
      false,
    );
    expect(infos.get('2026-07-01')?.status).toBe('done');
    expect(infos.get('2026-07-02')?.status).toBe('progress');
    expect(infos.get(TODAY)?.status).toBe('new');
    expect(infos.get(TODAY)?.today).toBe(true);
    expect(infos.get('2026-07-01')?.today).toBe(false);
  });

  it('paywalls unstarted grids strictly older than 7 days, only for subscribable users', () => {
    const boundary = summary('2026-06-26', 'seven');
    const older = summary('2026-06-25', 'eight');
    const none = () => ({ locked: 0, started: false });
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
