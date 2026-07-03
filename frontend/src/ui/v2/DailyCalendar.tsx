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

// No column gap: paywalled range bands must run continuously across adjacent days.
const weekRow = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '7px', justifyItems: 'center', alignItems: 'center' });

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
// Blush disc inside a conic progress ring; `--pct` (0-100) is set inline per cell.
const cellProgress = css({
  color: 'ws.jadeInk',
  border: 'none',
  background:
    'radial-gradient(closest-side, token(colors.ws.sakuraBlush) 76%, transparent 77% 100%), conic-gradient(token(colors.ws.sakura) calc(var(--pct) * 1%), rgba(190,73,112,0.22) 0)',
});
const cellNew = css({ bg: 'white', color: 'ws.khaki', border: 'none' });
// Paywalled days render as one continuous range band per row (date-range-picker style), gold like the lock tile.
const cellPaywalled = css({
  justifySelf: 'stretch',
  width: '100%',
  height: '34px',
  borderRadius: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsUi',
  fontSize: '13px',
  fontWeight: 'bold',
  border: 'none',
  padding: 0,
  bg: 'rgba(216,199,122,0.4)',
  color: '#5A4B12',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});
const capLeft = css({ borderTopLeftRadius: '999px', borderBottomLeftRadius: '999px' });
const capRight = css({ borderTopRightRadius: '999px', borderBottomRightRadius: '999px' });
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
  borderRadius: '50%',
  marginRight: '4px',
  verticalAlign: 'middle',
});

const swatchBand = css({ width: '16px', borderRadius: '999px', bg: 'rgba(216,199,122,0.75)' });

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

function pctOf(info: DayInfo): number {
  const total = info.summary.totalLetterCells;
  return total > 0 ? Math.round((info.locked / total) * 100) : 0;
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
            const paywalled = (c: (typeof week)[number]) => c != null && infos.get(c.iso)?.status === 'paywalled';
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
                  className={cx(cellPaywalled, !paywalled(week[ci - 1]) && capLeft, !paywalled(week[ci + 1]) && capRight)}
                  onClick={onPaywalledSelect}
                  aria-label={`Grille réservée à l'abonnement — ${longDateFr(cell.iso)}`}
                >
                  {cell.dayOfMonth}
                </button>
              );
            }
            const progress = info.status === 'progress';
            return (
              <Link
                key={ci}
                to="/play"
                search={info.today ? undefined : { date: cell.iso }}
                // the today ring only marks an untouched day — a progress arc would be unreadable under it
                className={cx(cellBase, byStatus[info.status], info.today && info.status === 'new' && cellToday)}
                style={progress ? ({ '--pct': pctOf(info) } as React.CSSProperties) : undefined}
                aria-label={`${actionLabel(info.status)} — ${longDateFr(cell.iso)}${progress ? ` — ${pctOf(info)} %` : ''}`}
              >
                {cell.dayOfMonth}
              </Link>
            );
          })}
        </div>
      ))}
      <p className={legend}>
        <span className={cx(swatch, cellDone)} aria-hidden="true" /> terminée ·{' '}
        <span className={cx(swatch, cellProgress)} style={{ '--pct': 66 } as React.CSSProperties} aria-hidden="true" /> en cours ·{' '}
        <span className={cx(swatch, cellNew)} aria-hidden="true" /> à jouer ·{' '}
        <span className={cx(swatch, swatchBand)} aria-hidden="true" /> réservées à l&apos;abonnement
      </p>
    </div>
  );
}
