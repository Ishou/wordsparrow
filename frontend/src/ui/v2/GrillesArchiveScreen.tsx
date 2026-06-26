import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Skeleton } from '@/design-system';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

type Status = 'done' | 'progress' | 'new';
type Filter = 'all' | 'todo' | 'done';

interface DayRow {
  readonly summary: DailySummary;
  readonly status: Status;
  readonly locked: number;
  readonly today: boolean;
}

const FILTERS: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'todo', label: 'À finir' },
  { id: 'done', label: 'Terminées' },
];

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '0 0 14px',
});

const seg = css({
  display: 'flex',
  bg: 'ws.sable',
  borderRadius: '13px',
  padding: '4px',
  gap: '4px',
  marginBottom: '18px',
});
const segBtn = css({
  flex: 1,
  border: 'none',
  background: 'transparent',
  borderRadius: '10px',
  padding: '9px 0',
  fontFamily: 'wsUi',
  fontWeight: 'extrabold',
  fontSize: '12.5px',
  color: 'ws.khaki',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const segOn = css({ bg: 'white', color: 'ws.jadeInk', boxShadow: '0 2px 6px rgba(33,75,64,0.12)' });

const monthLabel = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'extrabold',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#6B520F',
  margin: '4px 4px 10px',
});

const list = css({ listStyle: 'none', margin: 0, padding: 0 });
const card = css({
  bg: 'white',
  borderRadius: '16px',
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '10px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05)',
});
const dot = css({
  width: '38px',
  height: '38px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '17px',
  flex: 'none',
});
const dotDone = css({ bg: 'ws.sakura', color: 'white' });
const dotProg = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });
const dotNew = css({ bg: 'ws.sable', color: 'ws.khaki' });

const mid = css({ flex: 1, minWidth: 0 });
const dTitle = css({ fontFamily: 'wsUi', fontWeight: 'extrabold', fontSize: '14px', color: 'ws.jadeInk' });
const dMeta = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.7, marginTop: '2px' });
const bar = css({ height: '7px', borderRadius: '999px', bg: 'rgba(33,75,64,0.1)', overflow: 'hidden', marginTop: '7px' });
const barFill = css({ display: 'block', height: '100%', borderRadius: '999px', bg: '#4F6E5C' });

const cta = css({
  flex: 'none',
  border: 'none',
  borderRadius: '11px',
  padding: '9px 13px',
  fontFamily: 'wsUi',
  fontWeight: 'extrabold',
  fontSize: '12.5px',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const ctaPrimary = css({ bg: 'ws.sakura', color: 'white', boxShadow: '0 4px 10px rgba(212,93,131,0.3)' });
const ctaGhost = css({ bg: 'ws.sable', color: 'ws.khaki' });

const todayFlag = css({
  display: 'inline-block',
  fontFamily: 'wsUi',
  fontSize: '9px',
  fontWeight: 'black',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'ws.sakura',
  bg: 'ws.sakuraBlush',
  borderRadius: '999px',
  padding: '2px 7px',
  marginLeft: '6px',
  verticalAlign: 'middle',
});

const moreBtn = css({
  display: 'block',
  margin: '8px auto 0',
  background: 'transparent',
  border: '2px solid rgba(33,75,64,0.18)',
  borderRadius: '12px',
  padding: '11px 18px',
  fontFamily: 'wsUi',
  fontWeight: 'extrabold',
  fontSize: '13px',
  color: 'ws.jadeInk',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'default' },
});

const empty = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.7, textAlign: 'center', padding: '24px 0' });

const SYMBOL: Record<Status, string> = { done: '✓', progress: '◔', new: '○' };

// "Jeudi 26 juin" from a UTC ISO date.
function longDateFr(iso: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Juin 2026" month bucket label from a UTC ISO date.
function monthFr(iso: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// UTC YYYY-MM-DD — matches DailySummary.date and the server's UTC clamp.
function isoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function metaFor(row: DayRow): string {
  const total = row.summary.totalLetterCells;
  if (row.status === 'done') return 'Terminée';
  if (row.status === 'progress') return `En cours · ${row.locked} / ${total} cases`;
  return 'Pas encore commencée';
}

function ctaLabel(status: Status): string {
  if (status === 'done') return 'Revoir';
  if (status === 'progress') return 'Reprendre';
  return 'Commencer';
}

export function GrillesArchiveScreen({
  puzzleRepository,
  soloEntriesStore,
}: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [summaries, setSummaries] = useState<ReadonlyArray<DailySummary>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  // Oldest date we've already requested down to; load-more widens the window further back.
  const [floor, setFloor] = useState<string | undefined>(undefined);

  const todayIso = useMemo(() => isoUtcDate(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    puzzleRepository
      .listDailySummaries(floor != null ? { to: todayIso, from: floor } : { to: todayIso })
      .then((page) => {
        if (cancelled) return;
        setSummaries(page.items);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (!cancelled) {
          setSummaries([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleRepository, todayIso, floor]);

  const rows = useMemo<ReadonlyArray<DayRow>>(() => {
    return summaries.map((summary) => {
      const total = summary.totalLetterCells;
      const locked = soloEntriesStore.loadLockedCells(summary.id).length;
      const status: Status = total > 0 && locked >= total ? 'done' : locked > 0 ? 'progress' : 'new';
      return { summary, status, locked, today: summary.date === todayIso };
    });
  }, [summaries, soloEntriesStore, todayIso]);

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'all' ? true : filter === 'done' ? r.status === 'done' : r.status !== 'done',
      ),
    [rows, filter],
  );

  // Preserve the DESC-by-date order while grouping into month sections.
  const months = useMemo(() => {
    const out: Array<{ key: string; rows: DayRow[] }> = [];
    for (const r of visible) {
      const key = monthFr(r.summary.date);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, rows: [r] });
    }
    return out;
  }, [visible]);

  const loadMore = () => {
    if (summaries.length === 0) return;
    const oldest = summaries[summaries.length - 1].date;
    const widened = new Date(`${oldest}T00:00:00Z`);
    widened.setUTCDate(widened.getUTCDate() - 30);
    setFloor(isoUtcDate(widened));
  };

  const openDay = (row: DayRow) => {
    navigate(row.today ? { to: '/v2/play' } : { to: '/v2/play', search: { date: row.summary.date } });
  };

  return (
    <PhoneShell header={<BackHeader to="/v2" />}>
      <h1 className={title}>Grilles</h1>

      <div className={seg} role="tablist" aria-label="Filtrer les grilles">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? cx(segBtn, segOn) : segBtn}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <ul className={list} aria-busy="true" aria-label="Chargement des grilles">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className={card}>
              <Skeleton tone="onCard" width={38} height={38} radius={12} />
              <div className={mid}>
                <Skeleton tone="onCard" width={170} height={14} />
                <Skeleton tone="onCard" width={110} height={12} style={{ marginTop: '6px' }} />
              </div>
              <Skeleton tone="onCard" width={84} height={34} radius={11} />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <p className={empty}>Aucune grille à afficher.</p>
      ) : (
        <>
          {months.map((m) => (
            <section key={m.key} aria-label={m.key}>
              <div className={monthLabel}>{m.key}</div>
              <ul className={list}>
                {m.rows.map((row) => {
                  const total = row.summary.totalLetterCells;
                  const pct = total > 0 ? Math.round((row.locked / total) * 100) : 0;
                  return (
                    <li key={row.summary.id} className={card}>
                      <span
                        className={cx(dot, row.status === 'done' ? dotDone : row.status === 'progress' ? dotProg : dotNew)}
                        aria-hidden="true"
                      >
                        {SYMBOL[row.status]}
                      </span>
                      <div className={mid}>
                        <div className={dTitle}>
                          {longDateFr(row.summary.date)} · n°{row.summary.gridNumber}
                          {row.today ? <span className={todayFlag}>Aujourd&apos;hui</span> : null}
                        </div>
                        <div className={dMeta}>{metaFor(row)}</div>
                        {row.status === 'progress' ? (
                          <div className={bar}>
                            <span className={barFill} style={{ width: `${pct}%` }} />
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={cx(cta, row.status === 'done' ? ctaGhost : ctaPrimary)}
                        onClick={() => openDay(row)}
                        aria-label={`${ctaLabel(row.status)} — ${longDateFr(row.summary.date)}`}
                      >
                        {ctaLabel(row.status)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {hasMore ? (
            <button type="button" className={moreBtn} onClick={loadMore}>
              Charger les grilles précédentes
            </button>
          ) : null}
        </>
      )}
    </PhoneShell>
  );
}
