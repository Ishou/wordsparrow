import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeSlash, UsersThree } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { Puzzle } from '@/domain';
import { extractLobbyCode, LOBBY_CODE_PATTERN } from '@/domain/game/lobbyCode';
import type { DailySummary, PuzzleRepository, WordsRepository } from '@/application';
import { LobbyClientError, type LobbyClient } from '@/application/game';
import { useOptionalAuth } from '@/ui/components/auth';
import { HostSignInSheet } from './HostSignInSheet';
import type { Pseudonym, SessionId } from '@/domain/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Skeleton } from '@/design-system';
import { useCanSubscribe } from '@/ui/components/billing';
import { HomeTeaser } from '@/ui/v2/UpsellEntries';
import { MenuSheet } from '@/ui/v2/MenuSheet';
import { MobileTopBar } from '@/ui/v2/MobileTopBar';
import { BottomNav } from '@/ui/v2/BottomNav';
import { DesktopAppBar } from '@/ui/v2/DesktopAppBar';
import { SkipLink } from '@/ui/v2/SkipLink';
import { PrimaryButton, SecondaryButton } from '@/ui/v2/Buttons';
import { progressRingBackground } from '@/ui/v2/DailyCalendar';
import { HomeGreetingArt, bucketForHour, greetingForBucket } from './HomeGreetingArt';
import { MiniGame } from './MiniGame';
import { useDelayedFlag } from '@/ui/lib/useDelayedFlag';

type HomeSession = { readonly sessionId: SessionId; readonly pseudonym: Pseudonym };

// Daily-card state: loading → ok/unavailable/error (ADR-0042 / 404 → calm "bientôt").
type DailyState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly puzzle: Puzzle }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' };

// v2 home (ADR-0072): dev-only sandbox; /accueil untouched; previous grids strip uses real summaries.

const shell = css({
  // Cap to the viewport so the top bar + bottom nav pin and only `content` scrolls (app-shell), at every width.
  height: '100dvh',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Tablet: a contained app card on a calm jade surround. Desktop: full-bleed for the 2-col layout.
  md: { bgImage: 'none', bg: 'var(--colors-ws-hero-flat)', justifyContent: 'center', padding: '40px 24px' },
  lg: { height: '100dvh', bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0 },
});
// Phone: mobile column. Tablet: centred framed card. Desktop: a wide 2-column container.
const frame = css({
  width: '100%',
  // Match PhoneShell's phone column so home and grilles share the exact same page width.
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  md: {
    flex: 'none',
    maxWidth: '460px',
    height: 'min(900px, calc(100dvh - 80px))',
    borderRadius: '28px',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(33,75,64,0.18)',
  },
  // Desktop: full-width single-column bleed; flex/height reset md's fixed 900px cap so the frame fills the viewport instead of stopping 80px short.
  lg: {
    flex: 1,
    height: 'auto',
    maxWidth: 'none',
    minHeight: 0,
    borderRadius: 0,
    boxShadow: 'none',
    bgImage: 'none',
    overflow: 'visible',
  },
});
const content = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  // Bottom inset clears the fixed BottomNav so the last grids row isn't hidden behind it; top spacing lives in MobileTopBar.
  padding: '0 22px calc(64px + env(safe-area-inset-bottom))',
  overflowY: 'auto',
  // Desktop: full-width scroller under the pinned bar; scrollbarGutter reserves the scrollbar's track so it never overlaps the centred hub.
  lg: { overflowY: 'auto', padding: '0 0 40px', scrollbarGutter: 'stable' },
});

// Desktop hub: hero (left) + grilles (right) side by side, capped + centred in the viewport (matches the 1140 top-bar cap). Passthrough on phone/tablet.
const hub = css({ display: 'contents', lg: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 0.92fr)', columnGap: '36px', alignItems: 'start', alignContent: 'center', flex: '1 0 auto', width: '100%', maxWidth: '1140px', marginInline: 'auto', paddingInline: '36px' } });

const hero = css({ flex: 'none', bg: 'ws.card', borderRadius: '22px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 14px 30px rgba(33,75,64,0.10)' });
// clipPath clips upward overflow (midday sun, night stars) while its -34 px bottom inset lets the branch drape over heroBody; zIndex 2 keeps it above.
// Taller on the wider desktop hero so the slice-scaled sky (sun/moon) clears the visible band.
const heroArt = css({ position: 'relative', height: '116px', borderTopLeftRadius: '22px', borderTopRightRadius: '22px', zIndex: 2, clipPath: 'inset(0 0 -34px 0 round 22px 22px 0 0)', lg: { height: '208px' } });
const heroBody = css({ position: 'relative', zIndex: 1, padding: '12px 22px 22px' });
const heroGreeting = css({ marginBottom: '12px' });
const heroHi = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '23px', color: 'ws.jadeInk', lineHeight: '1.1' });
const heroSub = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', opacity: 0.8, marginTop: '2px' });
// Reserved band above the mini-game for the streak chip (right-aligned; only filled at streak ≥ 2).
const heroTop = css({ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '6px' });
const streakChip = css({ display: 'inline-flex', alignItems: 'center', gap: '5px', bg: 'ws.sable', borderRadius: '999px', padding: '4px 10px', fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', boxShadow: '0 1px 2px rgba(33,75,64,0.08)' });
const streakRecord = css({ opacity: 0.55, fontWeight: 'semibold' });
const miniGame = css({ display: 'flex', justifyContent: 'center', marginBottom: '6px' });

// Reserve 51 px so async resolution doesn't shift the card height (measured 589→640 jump without).
const dailyBand = css({ minHeight: '51px', display: 'flex', flexDirection: 'column', justifyContent: 'center' });
const heroEyebrow = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'ws.eyebrow', marginBottom: '6px', textAlign: 'center' });
const heroDate = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '27px', color: 'ws.jadeInk', lineHeight: '1.05', textAlign: 'center' });
const playBtn = css({ marginTop: '20px' });
const coopBtn = css({ marginTop: '12px' });

const joinRow = css({ display: 'flex', gap: '8px', marginTop: '10px' });
const joinField = css({ position: 'relative', flex: 1, minWidth: 0 });
const joinInput = css({
  width: '100%',
  height: '48px',
  borderRadius: '13px',
  border: '1.5px solid rgba(33,75,64,0.12)',
  bg: 'rgba(255,255,255,0.62)',
  paddingLeft: '16px',
  paddingRight: '44px',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  letterSpacing: '0.04em',
  _placeholder: { color: 'ws.khaki', opacity: 0.85, fontWeight: 'semibold', letterSpacing: 'normal' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  '&[aria-invalid="true"]': { borderColor: 'ws.sakuraDark' },
});
// Mask via CSS on a type=text input — type=password is what makes the browser offer password autofill on this (non-secret) join code.
const joinMaskStyle = {
  WebkitTextSecurity: 'disc',
  ...({ textSecurity: 'disc' } as Record<string, string>),
} as CSSProperties;
const joinEyeBtn = css({ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '10px', bg: 'transparent', color: 'ws.khaki', cursor: 'pointer', _hover: { color: 'ws.jadeInk' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const joinGo = css({ flex: 'none', width: '48px', height: '48px', borderRadius: '13px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'ws.jade', color: 'ws.jadeInk', cursor: 'pointer', transition: 'background-color 120ms', _hover: { bg: 'ws.jadeHover' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const joinErr = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', marginTop: '7px', textAlign: 'center' });

// Legal footer on the home page — Google OAuth branding verification requires the privacy-policy link visible here.
const legalNav = css({ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '16px', fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'semibold', color: 'ws.khaki', lg: { marginTop: '12px' } });
const legalLink = css({ color: 'ws.khaki', textDecoration: 'underline', textUnderlineOffset: '3px', _hover: { color: 'ws.jadeInk' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '4px' } });

const prevWrap = css({ flex: 'none', marginTop: '26px', paddingBottom: '22px', lg: { marginTop: 0, paddingBottom: 0 } });
const teaserWrap = css({ marginTop: '16px' });
const prevLabel = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.jadeInk', marginBottom: '12px', paddingLeft: '2px' });
const prevCard = css({ bg: 'ws.sable', borderRadius: '18px', padding: '15px 10px', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });
const prevRow = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' });
const dayCol = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', flex: 1 });
const dayWd = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9 });
const dayDot = css({ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '13px' });
// A playable past/today day is a button: same dot, with a press affordance.
const dayDotBtn = css({ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '13px', padding: 0, cursor: 'pointer', transition: 'transform 120ms', _hover: { transform: 'translateY(-1px)' }, _active: { transform: 'translateY(0)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

const WD_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;

// Time-neutral greeting shown during prerender + first client paint (before the real time-of-day greeting resolves post-mount).
const NEUTRAL_GREETING = { hi: 'Bonjour', sub: 'Une nouvelle grille rien que pour toi.' } as const;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// UTC YYYY-MM-DD — matches DailySummary.date and the server's UTC clamp.
function isoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "Jeudi 25 juin" from a UTC ISO date — used for the day-dot aria labels.
function longDateFr(iso: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type DayStatus = 'solved' | 'started' | 'none';

// Solved: sakura fill; started: blush disc + conic completion arc; today: sakura ring; untouched past: white dot.
function dayDotStyle(today: boolean, status: DayStatus, pct = 0): CSSProperties {
  if (status === 'solved') return { background: 'var(--colors-ws-sakura-dark)', color: 'white', border: today ? '2px solid var(--colors-ws-sakura-dark)' : undefined };
  if (status === 'started') return { background: progressRingBackground(pct), color: 'var(--colors-ws-jade-ink)' };
  if (today) return { background: 'transparent', border: '2px solid var(--colors-ws-sakura)', color: 'var(--colors-ws-jade-ink)' };
  return { background: 'white', color: 'var(--colors-ws-khaki)' };
}

export function HomeScreen({
  puzzleRepository,
  soloEntriesStore,
  wordsRepository,
  lobbyClient,
  getSession,
}: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly wordsRepository?: WordsRepository;
  // Present only when the multiplayer flag is on (ADR-0018 §10); gates the co-op entry.
  readonly lobbyClient?: LobbyClient;
  readonly getSession?: () => HomeSession;
}) {
  const navigate = useNavigate();
  const canSubscribe = useCanSubscribe();
  const [streak, setStreak] = useState({ cur: 0, best: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  // The mini-game docks our on-screen keyboard over the bottom nav; hide the nav while it's up.
  const [miniGameTyping, setMiniGameTyping] = useState(false);
  const [coopPending, setCoopPending] = useState(false);
  const [hostSignInOpen, setHostSignInOpen] = useState(false);
  const auth = useOptionalAuth();
  const { authClient } = useRouteContext({ from: '__root__' });

  const multiplayerOn = lobbyClient != null && getSession != null;
  // Hosting is entitlement-gated server-side (ADR-0083): guests get 401. Prompt sign-in before the call so they don't hit a silent failure; joining stays open.
  const handleCreateCoop = () => {
    if (!multiplayerOn || coopPending) return;
    // Gate on confirmed 'anon' only, not 'loading' — a returning authed player mustn't see this (ADR-0083).
    if (auth?.state.status === 'anon') {
      setHostSignInOpen(true);
      return;
    }
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

  const joinInputRef = useRef<HTMLInputElement>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinRevealed, setJoinRevealed] = useState(false);
  // extractLobbyCode also accepts a pasted share-link, so "just works" for both a bare code and a full URL.
  const handleJoinCoop = (e: FormEvent) => {
    e.preventDefault();
    const code = extractLobbyCode(joinInputRef.current?.value ?? '');
    if (!LOBBY_CODE_PATTERN.test(code)) {
      setJoinError('Code à 6 caractères (lettres et chiffres).');
      return;
    }
    navigate({ to: '/join/$code', params: { code } });
  };

  // Fetched client-side so the mini-game + strip paint at once; CTA gates on today's availability.
  const [daily, setDaily] = useState<DailyState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDaily({ status: 'loading' });
    puzzleRepository
      .fetchDaily()
      .then((puzzle) => {
        if (cancelled) return;
        setDaily(puzzle === null ? { status: 'unavailable' } : { status: 'ok', puzzle });
      })
      .catch(() => {
        if (!cancelled) setDaily({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [puzzleRepository, retry]);

  // Time-of-day art reveals only once the daily fetch settles. The prerender (ADR-0053) hangs that fetch, so its HTML stays time-neutral deterministically — prerender == first client paint, no build-time-sky swap (createRoot, not hydrate).
  const timeReady = daily.status !== 'loading';

  const { greeting, bucket, now: nowDate, dateLabel, week, range } = useMemo(() => {
    const now = new Date();
    const b = bucketForHour(now.getHours());
    const g = greetingForBucket(b);
    // Last 7 UTC days ending today (today last). ISO keys match the summaries.
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // Headline date reads in UTC to match the served puzzle + strip; local time rolls it a day early east of UTC.
    const dl = capitalize(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(todayUtc));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayUtc);
      d.setUTCDate(todayUtc.getUTCDate() - (6 - i));
      return { iso: isoUtcDate(d), wd: WD_LETTERS[d.getUTCDay()], num: d.getUTCDate(), today: i === 6 };
    });
    return { greeting: g, bucket: b, now, dateLabel: dl, week: days, range: { from: days[0].iso, to: days[6].iso } };
  }, []);

  // Pulls last-7-days summaries; marks each day solved when the solo store has it fully locked.
  const [history, setHistory] = useState<ReadonlyArray<DailySummary>>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    puzzleRepository
      .listDailySummaries({ from: range.from, to: range.to })
      .then((page) => { if (!cancelled) setHistory(page.items); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [puzzleRepository, range.from, range.to]);

  const weekCells = useMemo(() => {
    const byDate = new Map(history.map((s) => [s.date, s]));
    return week.map((d) => {
      const summary = byDate.get(d.iso);
      const lockedCount = summary != null ? soloEntriesStore.loadLockedCells(summary.id).length : 0;
      const solved = summary != null && summary.totalLetterCells > 0 && lockedCount >= summary.totalLetterCells;
      // Started = touched (any entry or locked cell) but not finished — distinguishes resumable grids from untouched ones.
      const started =
        !solved && summary != null && (lockedCount > 0 || soloEntriesStore.load(summary.id).length > 0);
      const status: DayStatus = solved ? 'solved' : started ? 'started' : 'none';
      const total = summary?.totalLetterCells ?? 0;
      const pct = total > 0 ? Math.round((lockedCount / total) * 100) : 0;
      return { ...d, available: summary != null, label: longDateFr(d.iso), status, pct };
    });
  }, [week, history, soloEntriesStore]);

  // Skeleton only if the daily is still loading after a beat — a fast fetch resolves first, no flash.
  const showDailySkeleton = useDelayedFlag(daily.status === 'loading');

  return (
    <main className={shell} lang="fr">
      <SkipLink />
      <div className={frame}>
        <DesktopAppBar active="accueil" streak={streak.cur} />
        <MobileTopBar onMenuClick={() => setMenuOpen(true)} />
        <div id="main-content" tabIndex={-1} className={content}>
          <div className={hub}>
          <section className={hero}>
            <HomeGreetingArt bucket={bucket} now={nowDate} className={heroArt} drape={34} neutral={!timeReady} />
            <div className={heroBody}>
              <div className={heroGreeting}>
                <h1 className={heroHi}>{(timeReady ? greeting : NEUTRAL_GREETING).hi}</h1>
                <p className={heroSub}>{(timeReady ? greeting : NEUTRAL_GREETING).sub}</p>
              </div>
              {streak.best >= 2 ? (
                <div className={heroTop}>
                  <div className={streakChip}>
                    <span>🔥 {streak.cur}</span>
                    <span className={streakRecord}>· record {streak.best}</span>
                  </div>
                </div>
              ) : null}
              <div className={miniGame}>
                <MiniGame
                  wordsRepository={wordsRepository}
                  onStreak={(cur, best) => setStreak({ cur, best })}
                  onKeyboardToggle={setMiniGameTyping}
                />
              </div>
              <div className={dailyBand}>
                {daily.status === 'loading' ? (
                  showDailySkeleton ? (
                    <div role="status" aria-busy="true" aria-label="Chargement de la grille du jour">
                      <Skeleton tone="onCard" width={130} height={11} style={{ margin: '0 auto 10px' }} />
                      <Skeleton tone="onCard" width={180} height={26} style={{ margin: '0 auto' }} />
                    </div>
                  ) : null
                ) : (
                  <>
                    <div className={heroEyebrow}>
                      {daily.status === 'error'
                        ? 'Chargement impossible'
                        : `Grille du jour${daily.status === 'ok' && daily.puzzle.gridNumber != null ? ` · n°${daily.puzzle.gridNumber}` : ''}`}
                    </div>
                    <div className={heroDate}>{daily.status === 'error' ? 'Oups, ça a coincé' : dateLabel}</div>
                  </>
                )}
              </div>
              <PrimaryButton
                className={playBtn}
                disabled={daily.status === 'loading' || daily.status === 'unavailable'}
                onClick={() => {
                  if (daily.status === 'ok') navigate({ to: '/play' });
                  else if (daily.status === 'error') setRetry((n) => n + 1);
                }}
              >
                {daily.status === 'ok'
                  ? 'Jouer'
                  : daily.status === 'loading'
                    ? 'Chargement…'
                    : daily.status === 'unavailable'
                      ? 'Bientôt disponible'
                      : 'Réessayer'}
              </PrimaryButton>
              {multiplayerOn ? (
                <>
                  <SecondaryButton
                    className={coopBtn}
                    onClick={handleCreateCoop}
                    disabled={coopPending}
                    aria-busy={coopPending || undefined}
                  >
                    <UsersThree size={20} weight="bold" aria-hidden="true" />
                    {coopPending ? 'Création…' : 'Jouer à plusieurs'}
                  </SecondaryButton>
                  <form className={joinRow} onSubmit={handleJoinCoop}>
                    <div className={joinField}>
                      <input
                        ref={joinInputRef}
                        className={joinInput}
                        style={joinRevealed ? undefined : joinMaskStyle}
                        type="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        data-1p-ignore=""
                        data-lpignore="true"
                        data-form-type="other"
                        placeholder="Rejoindre avec un code"
                        aria-label="Rejoindre une partie avec un code"
                        aria-invalid={joinError != null || undefined}
                        aria-describedby={joinError != null ? 'home-join-error' : undefined}
                        onInput={() => { if (joinError != null) setJoinError(null); }}
                      />
                      <button
                        type="button"
                        className={joinEyeBtn}
                        onClick={() => setJoinRevealed((v) => !v)}
                        aria-pressed={joinRevealed}
                        aria-label={joinRevealed ? 'Masquer le code' : 'Afficher le code'}
                      >
                        {joinRevealed ? (
                          <EyeSlash size={18} weight="bold" aria-hidden="true" />
                        ) : (
                          <Eye size={18} weight="bold" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <button type="submit" className={joinGo} aria-label="Rejoindre la partie">
                      <ArrowRight size={20} weight="bold" aria-hidden="true" />
                    </button>
                  </form>
                  {joinError != null ? (
                    <p id="home-join-error" className={joinErr} role="alert">{joinError}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <section className={prevWrap}>
            <div className={prevLabel}>Grilles précédentes</div>
            <div className={prevCard} aria-busy={historyLoading || undefined}>
              <div className={prevRow}>
                {week.map((d, i) => {
                  const cell = historyLoading ? null : weekCells[i];
                  return (
                    <div key={i} className={dayCol}>
                      <span className={dayWd}>{d.wd}</span>
                      {cell?.available ? (
                        <button
                          type="button"
                          className={dayDotBtn}
                          style={dayDotStyle(d.today, cell.status, cell.pct)}
                          onClick={() => navigate({ to: '/play', search: { date: d.iso } })}
                          aria-label={`${cell.label}${d.today ? " (aujourd'hui)" : ''}${cell.status === 'solved' ? ' — terminée' : cell.status === 'started' ? ` — commencée — ${cell.pct} %` : ''}`}
                        >
                          {d.num}
                        </button>
                      ) : (
                        <span className={dayDot} style={dayDotStyle(d.today, cell?.status ?? 'none', cell?.pct ?? 0)}>
                          {d.num}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {canSubscribe ? (
              <div className={teaserWrap}>
                <HomeTeaser />
              </div>
            ) : null}
          </section>
          </div>
          <footer>
            <nav className={legalNav} aria-label="Liens légaux">
              <Link className={legalLink} to="/confidentialite">
                Confidentialité
              </Link>
              <span aria-hidden="true">·</span>
              <Link className={legalLink} to="/mentions-legales">
                Mentions légales
              </Link>
            </nav>
          </footer>
        </div>

        {!miniGameTyping ? <BottomNav active="accueil" /> : null}
      </div>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} streak={streak.cur} />
      <HostSignInSheet open={hostSignInOpen} authClient={authClient} onClose={() => setHostSignInOpen(false)} />
    </main>
  );
}
