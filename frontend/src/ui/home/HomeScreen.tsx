import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeSlash, List, UsersThree } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { Puzzle } from '@/domain';
import { extractLobbyCode, LOBBY_CODE_PATTERN } from '@/domain/game/lobbyCode';
import type { DailySummary, PuzzleRepository, WordsRepository } from '@/application';
import type { LobbyClient } from '@/application/game';
import type { Pseudonym, SessionId } from '@/domain/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Lockup, Skeleton } from '@/design-system';
import { MenuSheet } from '@/ui/v2/MenuSheet';
import { DesktopAppBar } from '@/ui/v2/DesktopAppBar';
import { HomeGreetingArt, bucketForHour, greetingForBucket } from './HomeGreetingArt';
import { TeaserWord } from './TeaserWord';
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
  minHeight: '100dvh',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Tablet: a contained app card on a calm jade surround. Desktop: full-bleed for the 2-col layout.
  md: { bgImage: 'none', bg: '#9CCBB1', justifyContent: 'center', padding: '40px 24px' },
  lg: { bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0 },
});
// Phone: mobile column. Tablet: centred framed card. Desktop: a wide 2-column container.
const frame = css({
  width: '100%',
  maxWidth: '420px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  md: {
    flex: 'none',
    maxWidth: '460px',
    height: 'min(900px, calc(100dvh - 80px))',
    borderRadius: '28px',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(33,75,64,0.18)',
  },
  lg: {
    maxWidth: '1140px',
    height: 'auto',
    minHeight: '100dvh',
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
  padding: 'calc(env(safe-area-inset-top) + 22px) 22px 0',
  overflowY: 'auto',
  // Desktop: top nav, then the two columns vertically centred in the remaining space.
  lg: { overflow: 'visible', padding: '0 36px 40px' },
});

// Phone/tablet header only — desktop uses the shared DesktopAppBar above the frame.
const appBar = css({ flex: 'none', display: 'flex', alignItems: 'center', marginBottom: '24px', lg: { display: 'none' } });
// Desktop hub: hero (left) + grilles (right) side by side, centred in the viewport. Passthrough on phone/tablet.
const hub = css({ display: 'contents', lg: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 0.92fr)', columnGap: '36px', alignItems: 'start', alignContent: 'center', flex: 1, minHeight: 0 } });
const menuBtn = css({ marginLeft: 'auto', flex: 'none', width: '44px', height: '44px', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'rgba(255,255,255,0.62)', color: 'ws.jadeInk', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'rgba(255,255,255,0.82)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const brandLink = css({ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', borderRadius: '12px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '4px' } });

const hero = css({ flex: 'none', bg: 'white', borderRadius: '22px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 14px 30px rgba(33,75,64,0.10)' });
// clipPath clips upward overflow (midday sun, night stars) while its -34 px bottom inset lets the branch drape over heroBody; zIndex 2 keeps it above.
// Taller on the wider desktop hero so the slice-scaled sky (sun/moon) clears the visible band.
const heroArt = css({ position: 'relative', height: '116px', borderTopLeftRadius: '22px', borderTopRightRadius: '22px', zIndex: 2, clipPath: 'inset(0 0 -34px 0 round 22px 22px 0 0)', lg: { height: '208px' } });
const heroBody = css({ position: 'relative', zIndex: 1, padding: '12px 22px 22px' });
const heroGreeting = css({ marginBottom: '12px' });
const heroHi = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '23px', color: 'ws.jadeInk', lineHeight: '1.1' });
const heroSub = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', opacity: 0.8, marginTop: '2px' });
// Reserved band above the teaser for the streak chip (right-aligned; only filled at streak ≥ 2).
const heroTop = css({ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '6px' });
const streakChip = css({ display: 'inline-flex', alignItems: 'center', gap: '5px', bg: 'ws.sable', borderRadius: '999px', padding: '4px 10px', fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', boxShadow: '0 1px 2px rgba(33,75,64,0.08)' });
const streakRecord = css({ opacity: 0.55, fontWeight: 'semibold' });
const teaser = css({ display: 'flex', justifyContent: 'center', marginBottom: '6px' });

// Reserve 51 px so async resolution doesn't shift the card height (measured 589→640 jump without).
const dailyBand = css({ minHeight: '51px', display: 'flex', flexDirection: 'column', justifyContent: 'center' });
const heroEyebrow = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#543C00', marginBottom: '6px', textAlign: 'center' });
const heroDate = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '27px', color: 'ws.jadeInk', lineHeight: '1.05', textAlign: 'center' });
const playBtn = css({ width: '100%', height: '54px', marginTop: '20px', border: 'none', borderRadius: '15px', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '18px', letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 8px 18px rgba(212,93,131,0.32)', transition: 'transform 120ms, box-shadow 120ms', _active: { transform: 'translateY(1px)', boxShadow: '0 4px 12px rgba(212,93,131,0.30)' }, _disabled: { bg: 'ws.khaki', opacity: 0.45, cursor: 'default', boxShadow: 'none', _active: { transform: 'none' } } });

// Secondary co-op entry under the daily card; jade-tinted so it reads below the primary sakura CTA.
const coopBtn = css({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '50px', marginTop: '12px', border: 'none', borderRadius: '15px', bg: 'rgba(255,255,255,0.62)', color: 'ws.jadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '16px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', transition: 'transform 120ms, background-color 120ms', _hover: { bg: 'rgba(255,255,255,0.82)' }, _active: { transform: 'translateY(1px)' }, _disabled: { opacity: 0.55, cursor: 'default', _active: { transform: 'none' } }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

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
const joinEyeBtn = css({ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '10px', bg: 'transparent', color: 'ws.khaki', cursor: 'pointer', _hover: { color: 'ws.jadeInk' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const joinGo = css({ flex: 'none', width: '48px', height: '48px', borderRadius: '13px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'ws.jade', color: 'ws.jadeInk', cursor: 'pointer', transition: 'background-color 120ms', _hover: { bg: '#A9D8BE' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const joinErr = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', marginTop: '7px', textAlign: 'center' });

const prevWrap = css({ flex: 'none', marginTop: '26px', paddingBottom: '22px', lg: { marginTop: 0, paddingBottom: 0 } });
const prevLabel = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.jadeInk', marginBottom: '12px', paddingLeft: '2px' });
const prevCard = css({ bg: 'ws.sable', borderRadius: '18px', padding: '15px 10px', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });
const prevRow = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' });
const dayCol = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', flex: 1 });
const dayWd = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9 });
const dayDot = css({ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '13px' });
// A playable past/today day is a button: same dot, with a press affordance.
const dayDotBtn = css({ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '13px', padding: 0, cursor: 'pointer', transition: 'transform 120ms', _hover: { transform: 'translateY(-1px)' }, _active: { transform: 'translateY(0)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

const nav = css({ flex: 'none', bg: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(14px)', borderTop: '0.5px solid rgba(33,75,64,0.10)', padding: '10px 28px calc(8px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', lg: { display: 'none' } });
const navItem = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '8px' } });
const navLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold' });

const WD_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;

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

// Solved day: sakura fill; today: sakura ring; unplayed past: white dot.
function dayDotStyle(today: boolean, solved: boolean): CSSProperties {
  if (solved) return { background: 'var(--colors-ws-sakura-dark)', color: 'white', border: today ? '2px solid var(--colors-ws-sakura-dark)' : undefined };
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
  const [streak, setStreak] = useState({ cur: 0, best: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [coopPending, setCoopPending] = useState(false);

  const multiplayerOn = lobbyClient != null && getSession != null;
  const handleCreateCoop = () => {
    if (!multiplayerOn || coopPending) return;
    setCoopPending(true);
    const { sessionId: ownerSessionId, pseudonym: ownerPseudonym } = getSession();
    lobbyClient
      .createLobby({ ownerSessionId, ownerPseudonym })
      .then((created) => navigate({ to: '/v2/lobby/$lobbyId', params: { lobbyId: created.id } }))
      .catch(() => setCoopPending(false));
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
    navigate({ to: '/v2/join/$code', params: { code } });
  };

  // Fetched client-side so the teaser + strip paint at once; CTA gates on today's availability.
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

  const { greeting, bucket, now: nowDate, dateLabel, week, range } = useMemo(() => {
    const now = new Date();
    const b = bucketForHour(now.getHours());
    const g = greetingForBucket(b);
    const dl = capitalize(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now));
    // Last 7 UTC days ending today (today last). ISO keys match the summaries.
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
      const solved =
        summary != null &&
        summary.totalLetterCells > 0 &&
        soloEntriesStore.loadLockedCells(summary.id).length >= summary.totalLetterCells;
      return { ...d, available: summary != null, label: longDateFr(d.iso), solved };
    });
  }, [week, history, soloEntriesStore]);

  // Skeleton only if the daily is still loading after a beat — a fast fetch resolves first, no flash.
  const showDailySkeleton = useDelayedFlag(daily.status === 'loading');

  return (
    <main className={shell} lang="fr">
      <div className={frame}>
        <DesktopAppBar active="accueil" streak={streak.cur} />
        <div className={content}>
          <header className={appBar}>
            <Link to="/v2" className={brandLink} aria-label="Accueil">
              <Lockup orientation="horizontal" tone="jade" iconSize={28} textSize={20} gap={9} />
            </Link>
            <button
              type="button"
              className={menuBtn}
              aria-label="Ouvrir le menu"
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              <List size={22} weight="bold" aria-hidden="true" />
            </button>
          </header>

          <div className={hub}>
          <section className={hero}>
            <HomeGreetingArt bucket={bucket} now={nowDate} className={heroArt} drape={34} />
            <div className={heroBody}>
              <div className={heroGreeting}>
                <h1 className={heroHi}>{greeting.hi}</h1>
                <p className={heroSub}>{greeting.sub}</p>
              </div>
              {streak.best >= 2 ? (
                <div className={heroTop}>
                  <div className={streakChip}>
                    <span>🔥 {streak.cur}</span>
                    <span className={streakRecord}>· record {streak.best}</span>
                  </div>
                </div>
              ) : null}
              <div className={teaser}>
                <TeaserWord
                  wordsRepository={wordsRepository}
                  onStreak={(cur, best) => setStreak({ cur, best })}
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
              <button
                type="button"
                className={playBtn}
                disabled={daily.status === 'loading' || daily.status === 'unavailable'}
                onClick={() => {
                  if (daily.status === 'ok') navigate({ to: '/v2/play' });
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
              </button>
              {multiplayerOn ? (
                <>
                  <button
                    type="button"
                    className={coopBtn}
                    onClick={handleCreateCoop}
                    disabled={coopPending}
                    aria-busy={coopPending || undefined}
                  >
                    <UsersThree size={20} weight="bold" aria-hidden="true" />
                    {coopPending ? 'Création…' : 'Jouer à plusieurs'}
                  </button>
                  <form className={joinRow} onSubmit={handleJoinCoop}>
                    <div className={joinField}>
                      <input
                        ref={joinInputRef}
                        className={joinInput}
                        type={joinRevealed ? 'text' : 'password'}
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
                          style={dayDotStyle(d.today, cell.solved)}
                          onClick={() => navigate({ to: '/v2/play', search: { date: d.iso } })}
                          aria-label={`${cell.label}${d.today ? " (aujourd'hui)" : ''}${cell.solved ? ' — terminée' : ''}`}
                        >
                          {d.num}
                        </button>
                      ) : (
                        <span className={dayDot} style={dayDotStyle(d.today, cell?.solved ?? false)}>
                          {d.num}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          </div>
        </div>

        <nav className={nav} aria-label="Navigation principale">
          <button type="button" className={navItem} aria-current="page">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.2 12 5l8 6.2V19a1 1 0 0 1-1 1h-4.2v-5.2H9.2V20H5a1 1 0 0 1-1-1z" stroke="var(--colors-ws-sakura)" strokeWidth="1.9" strokeLinejoin="round" /></svg>
            <span className={navLabel} style={{ color: 'var(--colors-ws-sakura)' }}>Accueil</span>
          </button>
          <button type="button" className={navItem} onClick={() => navigate({ to: '/v2/grilles' })}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" /><rect x="13.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" /><rect x="4.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" /><rect x="13.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" /></svg>
            <span className={navLabel} style={{ color: 'var(--colors-ws-jade-ink)', opacity: 0.55 }}>Grilles</span>
          </button>
          <button type="button" className={navItem} aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.4" r="3.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" /><path d="M5 19.5c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="var(--colors-ws-jade-ink)" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className={navLabel} style={{ color: 'var(--colors-ws-jade-ink)', opacity: 0.55 }}>Compte</span>
          </button>
        </nav>
      </div>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} streak={streak.cur} />
    </main>
  );
}
