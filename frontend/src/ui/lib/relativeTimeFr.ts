import { t } from '@/ui/i18n';
import { longDateFr } from '@/ui/v2/dailyCalendarModel';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Coarse FR relative time for triage cards; beyond a week it falls back to the absolute date.
export function relativeTimeFr(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return t('time.relative.now');
  if (diff < HOUR) return t('time.relative.minutes', { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('time.relative.hours', { count: Math.floor(diff / HOUR) });
  const days = Math.floor(diff / DAY);
  if (days === 1) return t('time.relative.yesterday');
  if (days < 7) return t('time.relative.days', { count: days });
  return longDateFr(iso.slice(0, 10));
}
