import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CaretRight } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { fetchAllDailySummaries, type DailySummary, type PuzzleRepository } from '@/application';
import type { AuthClient } from '@/application/auth';
import { LobbyClientError, type LobbyClient, type LobbySummary } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { Pseudonym, SessionId } from '@/domain/game';
import { Skeleton } from '@/design-system';
import { useCanSubscribe } from '@/ui/components/billing';
import { HostSignInSheet } from '@/ui/home/HostSignInSheet';
import { DailyCalendar } from './DailyCalendar';
import { deriveDayInfos, isoUtcDate, longDateFr, monthOf, nextMonth, prevMonth, type DayInfo } from './dailyCalendarModel';
import { GrillesLobbiesSection } from './GrillesLobbiesSection';
import { PhoneShell } from './PhoneShell';
import { MobileTopBar } from './MobileTopBar';
import { SegmentedControl } from './SegmentedControl';
import { GrillesEmptyState, LobbiesEmptyState } from './GrillesEmptyState';
import { BottomNav } from './BottomNav';
import { MenuSheet } from './MenuSheet';
import { AbonnementSheet, type SheetContext } from './AbonnementSheet';
import { ArchiveUpsellBanner } from './UpsellEntries';

export type GrillesOnglet = 'quotidiennes' | 'a-finir' | 'plusieurs';

type GrillesSession = { readonly sessionId: SessionId; readonly pseudonym: Pseudonym };

const ONGLETS: ReadonlyArray<{ readonly id: GrillesOnglet; readonly label: string }> = [
  { id: 'quotidiennes', label: 'Quotidiennes' },
  { id: 'a-finir', label: 'À finir' },
  { id: 'plusieurs', label: 'À plusieurs' },
];

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '0 0 14px',
});

const tabBar = css({ marginBottom: '18px' });

// The title + tabs pin at every width while the tab body scrolls; desktop paddingRight matches the body's so tabs stay aligned above the scrollbar.
const head = css({ flex: 'none', lg: { paddingRight: '16px' } });
// The tab body is the one scroll container; mobile carries the fixed-BottomNav inset the shell dropped (fillBody).
const scrollArea = css({ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)', lg: { paddingBottom: '40px', paddingRight: '16px', scrollbarGutter: 'stable' } });

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
const bannerWrap = css({ margin: '14px 0' });

// Desktop: cap the calendar near-square instead of stretching across the content column.
const calWrap = css({ lg: { maxWidth: '420px', marginInline: 'auto' } });
const calendarSkeletonCard = css({ bg: 'ws.sable', borderRadius: '18px', padding: '15px 12px' });
const calendarSkeletonRow = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '7px', justifyItems: 'center' });

const joinLink = css({
  display: 'block',
  textAlign: 'center',
  marginTop: '14px',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '13px',
  color: 'ws.jadeInk',
  textDecorationThickness: '2px',
  textUnderlineOffset: '3px',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

export function GrillesArchiveScreen({
  puzzleRepository,
  soloEntriesStore,
  onglet,
  onOngletChange,
  lobbyClient,
  getSession,
  authClient,
}: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly onglet: GrillesOnglet;
  readonly onOngletChange: (onglet: GrillesOnglet) => void;
  // Multiplayer adapters are optional — absent when the flag is off (ADR-0018 §10).
  readonly lobbyClient?: LobbyClient;
  readonly getSession?: () => GrillesSession;
  readonly authClient?: AuthClient;
}) {
  const navigate = useNavigate();
  const canSubscribe = useCanSubscribe();
  const [menuOpen, setMenuOpen] = useState(false);
  // Kept mounted (Ark animates its own close) and the context persists through the close transition.
  const [sheet, setSheet] = useState<{ open: boolean; context: SheetContext }>({ open: false, context: 'grid' });
  const [summaries, setSummaries] = useState<ReadonlyArray<DailySummary>>([]);
  const [loading, setLoading] = useState(true);
  // Gate the skeleton behind a short delay so sub-200ms loads never flash it.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([]);
  const [coopPending, setCoopPending] = useState(false);
  const [hostSignInOpen, setHostSignInOpen] = useState(false);

  const todayIso = useMemo(() => isoUtcDate(new Date()), []);
  const currentMonth = monthOf(todayIso);
  const [month, setMonth] = useState(currentMonth);

  const multiplayer = lobbyClient != null && getSession != null;
  const effectiveOnglet: GrillesOnglet = onglet === 'plusieurs' && !multiplayer ? 'quotidiennes' : onglet;
  const onglets = multiplayer ? ONGLETS : ONGLETS.filter((o) => o.id !== 'plusieurs');

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
    fetchAllDailySummaries(puzzleRepository, todayIso)
      .then((items) => {
        if (!cancelled) setSummaries(items);
      })
      .catch(() => {
        if (!cancelled) setSummaries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleRepository, todayIso]);

  useEffect(() => {
    if (lobbyClient == null || getSession == null) return;
    let cancelled = false;
    lobbyClient
      .listMyLobbies(getSession().sessionId)
      .then((items) => {
        if (!cancelled) setLobbies(items);
      })
      .catch(() => {
        if (!cancelled) setLobbies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lobbyClient, getSession]);

  const infos = useMemo(
    () =>
      deriveDayInfos(
        summaries,
        (id) => {
          const locked = soloEntriesStore.loadLockedCells(id).length;
          // Started = any locked cell or saved entry, the same signal the home strip uses (ADR-0075 blob).
          return { locked, started: locked > 0 || soloEntriesStore.load(id).length > 0 };
        },
        todayIso,
        canSubscribe,
      ),
    [summaries, soloEntriesStore, todayIso, canSubscribe],
  );

  const earliestMonth = summaries.length > 0 ? monthOf(summaries[summaries.length - 1].date) : currentMonth;

  const enCours = useMemo(
    () => summaries.map((s) => infos.get(s.date)).filter((i): i is DayInfo => i?.status === 'progress'),
    [summaries, infos],
  );

  const createParty = () => {
    if (lobbyClient == null || getSession == null || coopPending) return;
    setCoopPending(true);
    const { sessionId: ownerSessionId, pseudonym: ownerPseudonym } = getSession();
    lobbyClient
      .createLobby({ ownerSessionId, ownerPseudonym })
      .then((created) => navigate({ to: '/lobby/$lobbyId', params: { lobbyId: created.id } }))
      .catch((cause) => {
        setCoopPending(false);
        // Safety net for a session that expired between load and tap (ADR-0083).
        if (cause instanceof LobbyClientError && cause.kind === 'unauthorized') setHostSignInOpen(true);
      });
  };

  const calendarSkeleton = (
    <div className={calWrap}>
      <div className={calendarSkeletonCard} aria-busy="true" aria-label="Chargement des grilles">
        {Array.from({ length: 5 }, (_, w) => (
          <div key={w} className={calendarSkeletonRow}>
            {Array.from({ length: 7 }, (_, d) => (
              <Skeleton key={d} tone="onCard" width={34} height={34} radius={999} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const quotidiennes = showSkeleton ? (
    calendarSkeleton
  ) : loading ? null : summaries.length === 0 ? (
    <GrillesEmptyState filter="new" onPlay={() => navigate({ to: '/play' })} />
  ) : (
    <div className={calWrap}>
      <DailyCalendar
        month={month}
        infos={infos}
        canPrev={month > earliestMonth}
        canNext={month < currentMonth}
        onPrev={() => setMonth(prevMonth(month))}
        onNext={() => setMonth(nextMonth(month))}
        onPaywalledSelect={() => setSheet({ open: true, context: 'grid' })}
      />
      {canSubscribe ? (
        <div className={bannerWrap}>
          <ArchiveUpsellBanner />
        </div>
      ) : null}
    </div>
  );

  const aFinir = showSkeleton ? (
    calendarSkeleton
  ) : loading ? null : enCours.length === 0 ? (
    <GrillesEmptyState filter="progress" onPlay={() => navigate({ to: '/play' })} />
  ) : (
    <ul className={list}>
      {enCours.map((info) => {
        const total = info.summary.totalLetterCells;
        const pct = total > 0 ? Math.round((info.locked / total) * 100) : 0;
        return (
          <li key={info.summary.id}>
            <Link
              to="/play"
              search={info.today ? undefined : { date: info.summary.date }}
              className={card}
              aria-label={`Reprendre — ${longDateFr(info.summary.date)}`}
            >
              <div className={mid}>
                <div className={dTitle}>
                  {longDateFr(info.summary.date)} · n°{info.summary.gridNumber}
                </div>
                <div className={dMeta}>
                  En cours · {info.locked} / {total} cases
                </div>
                <div className={bar}>
                  <span className={barFill} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <CaretRight className={chevron} size={18} weight="bold" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const plusieurs =
    lobbies.length > 0 ? (
      <GrillesLobbiesSection lobbies={lobbies} />
    ) : (
      <>
        <LobbiesEmptyState onCreate={createParty} />
        <Link to="/" className={joinLink}>
          Rejoindre avec un code
        </Link>
      </>
    );

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
            className={tabBar}
            ariaLabel="Choisir la vue des grilles"
            options={onglets}
            value={effectiveOnglet}
            onChange={onOngletChange}
          />
        </div>

        <div className={scrollArea}>
          {effectiveOnglet === 'quotidiennes' ? quotidiennes : effectiveOnglet === 'a-finir' ? aFinir : plusieurs}
        </div>
      </PhoneShell>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <AbonnementSheet
        open={sheet.open}
        context={sheet.context}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
      <HostSignInSheet open={hostSignInOpen} authClient={authClient} onClose={() => setHostSignInOpen(false)} />
    </>
  );
}
