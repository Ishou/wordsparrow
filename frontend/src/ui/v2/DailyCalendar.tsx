import { Link } from '@tanstack/react-router';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { longDateFr, monthGrid, monthLabelFr, type DayInfo, type DayStatus } from './dailyCalendarModel';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Same card language as the home "Grilles précédentes" strip (sable surface, 18px radius).
const cardWrap = css({ bg: 'ws.sable', borderRadius: '18px', padding: '15px 12px', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });

const header = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' });

const monthTitle = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'black',
  color: 'ws.jadeInk',
  margin: 0,
});

const navBtn = css({
  border: 'none',
  background: 'white',
  flex: 'none',
  borderRadius: '10px',
  width: '34px',
  height: '34px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'ws.jadeInk',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  cursor: 'pointer',
  _disabled: { opacity: 0.35, cursor: 'default' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const weekdayRow = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '4px',
  marginBottom: '8px',
  '& > span': {
    textAlign: 'center',
    fontFamily: 'wsUi',
    fontSize: '11px',
    fontWeight: 'bold',
    color: 'ws.khaki',
    opacity: 0.9,
  },
});

const weekRow = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '7px', justifyItems: 'center' });

// Day dots mirror the home strip: 34px circles, same status palette (dayDotStyle in HomeScreen).
const cellBase = css({
  width: '34px',
  height: '34px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsUi',
  fontSize: '13px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: 0,
  cursor: 'pointer',
  transition: 'transform 120ms',
  _hover: { transform: 'translateY(-1px)' },
  _active: { transform: 'translateY(0)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const cellBlank = css({ width: '34px', height: '34px' });

const cellVoid = css({
  color: 'ws.khaki',
  opacity: 0.35,
  cursor: 'default',
  _hover: { transform: 'none' },
});

const cellDone = css({ bg: 'ws.sakuraDark', color: 'white', border: 'none' });
const cellProgress = css({ bg: 'ws.sakuraBlush', color: 'ws.jadeInk', border: '2px solid token(colors.ws.sakura)' });
const cellNew = css({ bg: 'white', color: 'ws.khaki', border: 'none' });
const cellPaywalled = css({
  bg: 'rgba(255,255,255,0.45)',
  color: 'ws.khaki',
  border: 'none',
  opacity: 0.7,
  _hover: { transform: 'none' },
});
const cellToday = css({ border: '2px solid token(colors.ws.sakura)', color: 'ws.jadeInk', fontWeight: 'black' });

const legend = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'bold',
  color: 'ws.khaki',
  opacity: 0.85,
  margin: '10px 2px 0',
  lineHeight: '1.6',
});

const swatch = css({
  display: 'inline-block',
  width: '10px',
  height: '10px',
  borderRadius: '4px',
  marginRight: '4px',
  verticalAlign: 'middle',
});

const byStatus: Record<Exclude<DayStatus, 'paywalled'>, string> = {
  done: cellDone,
  progress: cellProgress,
  new: cellNew,
};

function actionLabel(status: DayStatus): string {
  if (status === 'done') return 'Revoir';
  if (status === 'progress') return 'Reprendre';
  return 'Commencer';
}

export interface DailyCalendarProps {
  readonly month: string;
  readonly infos: ReadonlyMap<string, DayInfo>;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onPaywalledSelect: () => void;
}

export function DailyCalendar({ month, infos, canPrev, canNext, onPrev, onNext, onPaywalledSelect }: DailyCalendarProps) {
  return (
    <div className={cardWrap}>
      <div className={header}>
        <button type="button" aria-label="Mois précédent" disabled={!canPrev} onClick={onPrev} className={navBtn}>
          <CaretLeft size={18} weight="bold" aria-hidden="true" />
        </button>
        <h2 className={monthTitle}>{monthLabelFr(month)}</h2>
        <button type="button" aria-label="Mois suivant" disabled={!canNext} onClick={onNext} className={navBtn}>
          <CaretRight size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className={weekdayRow} aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      {monthGrid(month).map((week, wi) => (
        <div key={wi} className={weekRow}>
          {week.map((cell, ci) => {
            if (cell == null) return <span key={ci} className={cellBlank} />;
            const info = infos.get(cell.iso);
            if (info == null) {
              return (
                <span key={ci} className={cx(cellBase, cellVoid)} aria-hidden="true">
                  {cell.dayOfMonth}
                </span>
              );
            }
            if (info.status === 'paywalled') {
              return (
                <button
                  key={ci}
                  type="button"
                  className={cx(cellBase, cellPaywalled)}
                  onClick={onPaywalledSelect}
                  aria-label={`Grille réservée à l'abonnement — ${longDateFr(cell.iso)}`}
                >
                  {cell.dayOfMonth}
                </button>
              );
            }
            return (
              <Link
                key={ci}
                to="/play"
                search={info.today ? undefined : { date: cell.iso }}
                className={cx(cellBase, byStatus[info.status], info.today && cellToday)}
                aria-label={`${actionLabel(info.status)} — ${longDateFr(cell.iso)}`}
              >
                {cell.dayOfMonth}
              </Link>
            );
          })}
        </div>
      ))}
      <p className={legend}>
        <span className={cx(swatch, cellDone)} aria-hidden="true" /> terminée ·{' '}
        <span className={cx(swatch, cellProgress)} aria-hidden="true" /> en cours ·{' '}
        <span className={cx(swatch, cellNew)} aria-hidden="true" /> à jouer · les grilles plus anciennes sont
        réservées à l&apos;abonnement
      </p>
    </div>
  );
}
