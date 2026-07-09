import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CaretRight } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { fetchAllDailySummaries, type DailySummary, type PuzzleRepository } from '@/application';
import type { AuthClient } from '@/application/auth';
import { LobbyClientError, type LobbyClient, type LobbySummary } from '@/application/game';
import { countFilledCells, type SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { Skeleton } from '@/design-system';
import { useAuth } from '@/ui/components/auth';
import { useCanSubscribe } from '@/ui/components/billing';
import { HostSignInSheet } from '@/ui/home/HostSignInSheet';
import { useCreateOrResume } from '@/ui/components/lobby/useCreateOrResume';
import { useToast } from '@/ui/components/primitives';
import { OwnedGameModal } from './multiplayer/OwnedGameModal';
import { DailyCalendar } from './DailyCalendar';
import { bar, barFill, card, chevron, list, mid, rowMeta, rowTitle } from './listRowStyles';
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
  { id: 'quotidiennes', label: t('v2.grilles.onglet.quotidiennes') },
  { id: 'a-finir', label: t('v2.grilles.onglet.aFinir') },
  { id: 'plusieurs', label: t('v2.grilles.onglet.plusieurs') },
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

const bannerWrap = css({ margin: '14px 0' });

// Desktop: cap the calendar near-square instead of stretching across the content column.
const calWrap = css({ lg: { maxWidth: '420px', marginInline: 'auto' } });
const calendarSkeletonCard = css({ bg: 'ws.sable', borderRadius: '18px', padding: '15px 12px' });
const calendarSkeletonRow = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '7px', justifyItems: 'center' });
// Mirrors the list-row card box (listRowStyles) minus the interactive affordances — this row isn't tappable.
const lobbySkeletonCard = css({ bg: 'ws.card', borderRadius: '16px', padding: '13px 14px', marginBottom: '10px', boxShadow: '0 1px 2px rgba(33,75,64,0.08)' });

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
  const { status: authStatus } = useAuth();
  const { show: showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  // Kept mounted (Ark animates its own close) and the context persists through the close transition.
  const [sheet, setSheet] = useState<{ open: boolean; context: SheetContext }>({ open: false, context: 'grid' });
  const [summaries, setSummaries] = useState<ReadonlyArray<DailySummary>>([]);
  const [loading, setLoading] = useState(true);
  // Gate the skeleton behind a short delay so sub-200ms loads never flash it.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(true);
  // Same anti-flash gate as the calendar skeleton: hold it back so sub-200ms loads never flash.
  const [showLobbiesSkeleton, setShowLobbiesSkeleton] = useState(false);
  // Bumped after a leave/delete so the lobbies effect refetches and the row drops.
  const [lobbiesRefreshTick, setLobbiesRefreshTick] = useState(0);
  const [hostSignInOpen, setHostSignInOpen] = useState(false);
  const coop = useCreateOrResume({
    lobbyClient: lobbyClient!,
    getSession: getSession!,
    // Safety net for a session that expired between load and tap (ADR-0083).
    onError: (cause) => {
      if (cause instanceof LobbyClientError && cause.kind === 'unauthorized') setHostSignInOpen(true);
    },
  });

  // ADR-0098 §6 / ADR-0083: claiming needs an account, so a guest is prompted to sign in first (mirrors the create-coop gate); then the ownerless "Reprendre" row claims and navigates into the now-owned lobby. A 403/409 surfaces a toast.
  const handleClaimLobby = useCallback(
    (lobbyId: LobbyId) => {
      if (lobbyClient == null) return;
      if (authStatus === 'anon') {
        setHostSignInOpen(true);
        return;
      }
      void lobbyClient
        .claimOwnership(lobbyId)
        .then(() => navigate({ to: '/lobby/$lobbyId', params: { lobbyId } }))
        .catch(() => showToast({ text: 'Impossible de reprendre la partie.', tone: 'error' }));
    },
    [lobbyClient, authStatus, navigate, showToast],
  );

  // ADR-0098 §6 (2026-07-08): leave/delete from the list; server decides delete-if-alone/leave-if-others, refetch drops the row.
  const handleLeaveLobby = useCallback(
    (lobbyId: LobbyId): Promise<void> => {
      if (lobbyClient == null) return Promise.resolve();
      // Reject on failure so the row's confirm dialog owns the delete-vs-leave error copy + retry.
      return lobbyClient.leaveLobby(lobbyId).then(() => setLobbiesRefreshTick((tick) => tick + 1));
    },
    [lobbyClient],
  );
  const coopPending = coop.pending || coop.startingNew;

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
    if (!lobbiesLoading) {
      setShowLobbiesSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowLobbiesSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, [lobbiesLoading]);

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
    if (authStatus === 'loading') return;
    let cancelled = false;
    setLobbiesLoading(true);
    // ADR-0066: authed players get the cross-device user-scoped union; anon stays session-scoped.
    const fetching =
      authStatus === 'authed' ? lobbyClient.listMyLobbiesForUser() : lobbyClient.listMyLobbies(getSession().sessionId);
    fetching
      .then((items) => {
        if (!cancelled) setLobbies(items);
      })
      .catch(() => {
        if (!cancelled) setLobbies([]);
      })
      .finally(() => {
        if (!cancelled) setLobbiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lobbyClient, getSession, authStatus, lobbiesRefreshTick]);

  const infos = useMemo(
    () =>
      deriveDayInfos(
        summaries,
        (id) => ({
          locked: soloEntriesStore.loadLockedCells(id).length,
          filled: countFilledCells(soloEntriesStore, id),
        }),
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
    coop.createOrResume();
  };

  const calendarSkeleton = (
    <div className={calWrap}>
      <div className={calendarSkeletonCard} role="status" aria-busy="true" aria-label={t('v2.grilles.loading')}>
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

  // Card-row skeleton for the two list tabs (À finir, À plusieurs); role="status" is the prerender ready-signal.
  const cardListSkeleton = (label: string) => (
    <ul className={list} role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className={lobbySkeletonCard}>
          <div className={mid}>
            <Skeleton tone="onCard" width="55%" height={14} />
            <Skeleton tone="onCard" width="40%" height={11} style={{ marginTop: 6 }} />
          </div>
        </li>
      ))}
    </ul>
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
        showPaywallLegend={canSubscribe}
      />
      {canSubscribe ? (
        <div className={bannerWrap}>
          <ArchiveUpsellBanner />
        </div>
      ) : null}
    </div>
  );

  const aFinir = showSkeleton ? (
    cardListSkeleton(t('v2.grilles.loading'))
  ) : loading ? null : enCours.length === 0 ? (
    <GrillesEmptyState filter="progress" onPlay={() => navigate({ to: '/play' })} />
  ) : (
    <ul className={list}>
      {enCours.map((info) => {
        const total = info.summary.totalLetterCells;
        const pct = total > 0 ? Math.round((info.filled / total) * 100) : 0;
        return (
          <li key={info.summary.id}>
            <Link
              to="/play"
              search={info.today ? undefined : { date: info.summary.date }}
              className={card}
              aria-label={t('v2.grilles.aFinir.reprendreAria', { date: longDateFr(info.summary.date) })}
            >
              <div className={mid}>
                <div className={rowTitle}>
                  {t('v2.grilles.aFinir.rowTitle', { date: longDateFr(info.summary.date), num: info.summary.gridNumber })}
                </div>
                <div className={rowMeta}>
                  {t('v2.grilles.aFinir.rowMeta', { filled: info.filled, total })}
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

  const plusieurs = showLobbiesSkeleton ? (
    cardListSkeleton(t('v2.grilles.plusieurs.loading'))
  ) : lobbiesLoading ? null : lobbies.length > 0 ? (
    <GrillesLobbiesSection lobbies={lobbies} onClaim={handleClaimLobby} onLeave={handleLeaveLobby} />
  ) : (
    <>
      <LobbiesEmptyState onCreate={createParty} />
      <Link to="/" className={joinLink}>
        {t('v2.grilles.plusieurs.join')}
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
          <h1 className={title}>{t('v2.grilles.title')}</h1>

          <SegmentedControl
            className={tabBar}
            ariaLabel={t('v2.grilles.tabsAria')}
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
      <OwnedGameModal
        lobby={coop.ownedGame}
        onRejoindre={coop.rejoindre}
        onStartNew={coop.startNewGame}
        onClose={coop.dismiss}
        startingNew={coop.startingNew}
      />
    </>
  );
}
