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
  const s = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Juin 2026" from a YYYY-MM month key.
export function monthLabelFr(month: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
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
  return Math.round(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000,
  );
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
    // Cosmetic lock: older than 7 days, unstarted, non-subscriber (ADR-0080 W5a; server enforces in W5b).
    const status: DayStatus =
      base === 'new' && canSubscribe && !started && daysSince(summary.date, todayIso) > 7 ? 'paywalled' : base;
    out.set(summary.date, { summary, status, locked, today: summary.date === todayIso });
  }
  return out;
}
