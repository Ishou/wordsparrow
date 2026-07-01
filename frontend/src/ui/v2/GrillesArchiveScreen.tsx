import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CaretRight, Lock } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Skeleton } from '@/design-system';
import { useSubscriber } from '@/ui/components/billing';
import { PhoneShell } from './PhoneShell';
import { MobileTopBar } from './MobileTopBar';
import { SegmentedControl } from './SegmentedControl';
import { GrillesEmptyState } from './GrillesEmptyState';
import { BottomNav } from './BottomNav';
import { MenuSheet } from './MenuSheet';
import { AbonnementSheet, type SheetContext } from './AbonnementSheet';
import { ArchiveUpsellBanner } from './UpsellEntries';

type Status = 'done' | 'progress' | 'new';
// Filters mirror the statuses one-to-one — to-do-oriented, no neutral "all".
type Filter = Status;

interface DayRow {
  readonly summary: DailySummary;
  readonly status: Status;
  readonly locked: number;
  readonly today: boolean;
  // Cosmetic lock: older than 7 days, unstarted, non-subscriber (ADR-0080 W5a; server enforces in W5b).
  readonly paywalled: boolean;
}

const FILTERS: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: 'new', label: 'À jouer' },
  { id: 'progress', label: 'À finir' },
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

const filterBar = css({ marginBottom: '18px' });

// Desktop: the title + filter pin while list scrolls; paddingRight matches the list's so tabs stay aligned above the scrollbar.
const head = css({ lg: { flex: 'none', paddingRight: '16px' } });
// Desktop: the list is its own scroll container (one scrollbar, on the list); paddingRight keeps the cards from touching the scrollbar, which sits in the reserved gutter beyond it.
const scrollArea = css({ lg: { flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '40px', paddingRight: '16px', scrollbarGutter: 'stable' } });

const monthLabel = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#543C00',
  margin: '4px 4px 10px',
});

const list = css({ listStyle: 'none', margin: 0, padding: 0 });
// The whole row is the tap target — a quiet chevron is the only affordance, so primaries are reserved for the empty state.
const card = css({
  width: '100%',
  textAlign: 'left',
  textDecoration: 'none',
  bg: 'white',
  borderRadius: '16px',
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '10px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sable' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});

const mid = css({ flex: 1, minWidth: 0 });
const dTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
const dMeta = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.85, marginTop: '2px' });
const bar = css({ height: '7px', borderRadius: '999px', bg: 'rgba(33,75,64,0.1)', overflow: 'hidden', marginTop: '7px' });
const barFill = css({ display: 'block', height: '100%', borderRadius: '999px', bg: '#4F6E5C' });
const chevron = css({ flex: 'none', color: 'ws.khaki', opacity: 0.55 });

const todayFlag = css({
  display: 'inline-block',
  fontFamily: 'wsUi',
  fontSize: '9px',
  fontWeight: 'black',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'white',
  bg: 'ws.sakuraDark',
  borderRadius: '999px',
  padding: '2px 7px',
  marginLeft: '6px',
  verticalAlign: 'middle',
});

const cardLocked = css({ border: 'none', bg: 'rgba(255,255,255,0.7)', _hover: { bg: 'rgba(255,255,255,0.7)' } });
const dTitleLocked = css({ color: 'ws.khaki' });
const lockedFlag = css({ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'wsUi', fontSize: '9px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#5A4B12', bg: 'ws.or', borderRadius: '999px', padding: '2px 7px 2px 5px', marginLeft: '6px', verticalAlign: 'middle' });
const lockTile = css({ flex: 'none', width: '30px', height: '30px', borderRadius: '9px', bg: 'ws.or', color: '#5A4B12', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9 });
const bannerWrap = css({ marginBottom: '14px' });

const moreBtn = css({
  display: 'block',
  margin: '8px auto 0',
  background: 'transparent',
  border: '2px solid rgba(33,75,64,0.18)',
  borderRadius: '12px',
  padding: '11px 18px',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '13px',
  color: 'ws.jadeInk',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'default' },
});

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

// Whole-day age of an ISO date relative to today (both UTC midnight).
function daysSince(iso: string, todayIso: string): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date(`${todayIso}T00:00:00Z`).getTime();
  return Math.round((now - then) / 86_400_000);
}

function metaFor(row: DayRow): string {
  const total = row.summary.totalLetterCells;
  if (row.status === 'done') return 'Terminée';
  if (row.status === 'progress') return `En cours · ${row.locked} / ${total} cases`;
  return 'Pas encore commencée';
}

function actionLabel(status: Status): string {
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
  const subscriber = useSubscriber();
  const [menuOpen, setMenuOpen] = useState(false);
  // Kept mounted (Ark animates its own close) and the context persists through the close transition.
  const [sheet, setSheet] = useState<{ open: boolean; context: SheetContext }>({ open: false, context: 'grid' });
  const [filter, setFilter] = useState<Filter>('new');
  const [summaries, setSummaries] = useState<ReadonlyArray<DailySummary>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  // Gate the skeleton behind a short delay so sub-200ms loads never flash it.
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Oldest date we've already requested down to; load-more widens the window further back.
  const [floor, setFloor] = useState<string | undefined>(undefined);

  const todayIso = useMemo(() => isoUtcDate(new Date()), []);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, [loading]);

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
      // Started = any locked cell or saved entry, the same signal the home strip uses (ADR-0075 blob).
      const started = locked > 0 || soloEntriesStore.load(summary.id).length > 0;
      const paywalled = !subscriber && !started && daysSince(summary.date, todayIso) > 7;
      return { summary, status, locked, today: summary.date === todayIso, paywalled };
    });
  }, [summaries, soloEntriesStore, todayIso, subscriber]);

  const visible = useMemo(
    () =>
      // Each filter maps to exactly one status: À jouer=new, À finir=progress, Terminées=done.
      rows.filter((r) => r.status === filter),
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

  return (
    <>
    <PhoneShell
      header={<MobileTopBar onMenuClick={() => setMenuOpen(true)} />}
      headerFlush
      navActive="grilles"
      bottomNav={<BottomNav active="grilles" />}
      fillBody
    >
      <div className={head}>
        <h1 className={title}>Grilles</h1>

        <SegmentedControl
          className={filterBar}
          ariaLabel="Filtrer les grilles"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <div className={scrollArea}>
      {!subscriber ? (
        <div className={bannerWrap}>
          <ArchiveUpsellBanner />
        </div>
      ) : null}
      {showSkeleton ? (
        <ul className={list} aria-busy="true" aria-label="Chargement des grilles">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className={card}>
              <div className={mid}>
                <Skeleton tone="onCard" width={170} height={14} />
                <Skeleton tone="onCard" width={110} height={12} style={{ marginTop: '6px' }} />
              </div>
              <Skeleton tone="onCard" width={18} height={18} radius={6} />
            </li>
          ))}
        </ul>
      ) : loading ? null : visible.length === 0 ? (
        <GrillesEmptyState filter={filter} onPlay={() => navigate({ to: '/play' })} />
      ) : (
        <>
          {months.map((m) => (
            <section key={m.key} aria-label={m.key}>
              <div className={monthLabel}>{m.key}</div>
              <ul className={list}>
                {m.rows.map((row) => {
                  const total = row.summary.totalLetterCells;
                  const pct = total > 0 ? Math.round((row.locked / total) * 100) : 0;
                  if (row.paywalled) {
                    return (
                      <li key={row.summary.id}>
                        <button
                          type="button"
                          className={cx(card, cardLocked)}
                          aria-label={`Grille réservée à l'abonnement — ${longDateFr(row.summary.date)}`}
                          onClick={() => setSheet({ open: true, context: 'grid' })}
                        >
                          <div className={mid}>
                            <div className={cx(dTitle, dTitleLocked)}>
                              {longDateFr(row.summary.date)} · n°{row.summary.gridNumber}
                              <span className={lockedFlag}>
                                <Lock size={9} weight="fill" aria-hidden="true" /> Abonnés
                              </span>
                            </div>
                            <div className={dMeta}>Réservée à l&apos;abonnement</div>
                          </div>
                          <span className={lockTile}>
                            <Lock size={15} weight="fill" aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={row.summary.id}>
                      <Link
                        to="/play"
                        search={row.today ? undefined : { date: row.summary.date }}
                        className={card}
                        aria-label={`${actionLabel(row.status)} — ${longDateFr(row.summary.date)}`}
                      >
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
                        <CaretRight className={chevron} size={18} weight="bold" aria-hidden="true" />
                      </Link>
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
      </div>
    </PhoneShell>
    <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    <AbonnementSheet
      open={sheet.open}
      context={sheet.context}
      onClose={() => setSheet((s) => ({ ...s, open: false }))}
    />
    </>
  );
}
