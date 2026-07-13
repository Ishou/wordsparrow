import { css } from 'styled-system/css';
import type { LockedCell, Player, SessionId } from '@/domain/game';
import { tallyValidatedLetters } from '@/application/game';
import { t } from '@/ui/i18n';
import { sparrowCelebrationScene } from '@/ui/v2/SparrowScenes';
import { formatClock } from '@/ui/lib/formatClock';
import { PlayerAvatar } from './PlayerAvatar';

// Co-op finish: per-player validated-letter tally ranked as a leaderboard (ADR-0102). Competitive/versus mode still deferred.

const formatDuration = (durationMs: number): string => formatClock(durationMs / 1000);

const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 8px 8px' });
const art = css({ display: 'flex', justifyContent: 'center', marginBottom: '12px' });
const titleCss = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '30px', lineHeight: '1.05', color: 'ws.jadeInk' });
const subCss = css({ fontFamily: 'wsUi', fontWeight: 'semibold', fontSize: '15px', lineHeight: '1.45', color: 'ws.khaki', opacity: 0.85, marginTop: '6px', maxWidth: '300px' });

const timeCard = css({
  marginTop: '22px',
  bg: 'ws.glass',
  borderRadius: '18px',
  padding: '16px 28px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
});
const timeLabel = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'black', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.85 });
const timeValue = css({ fontFamily: 'wsMono', fontWeight: 'semibold', fontSize: '40px', color: 'ws.jadeInk', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', marginTop: '4px', lineHeight: '1' });

const contribCard = css({
  width: '100%',
  marginTop: '18px',
  bg: 'ws.glass',
  borderRadius: '18px',
  padding: '16px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  textAlign: 'left',
});
const contribTitle = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'black', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.85, margin: '0 0 12px' });
const list = css({ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '9px', padding: 0, margin: 0 });
const playerRow = css({ display: 'flex', alignItems: 'center', gap: '11px' });
const playerName = css({ fontFamily: 'wsUi', fontSize: '16px', fontWeight: 'bold', color: 'ws.jadeInk', minWidth: 0 });
const badge = css({
  flex: 'none',
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  borderRadius: '999px',
  padding: '3px 8px',
  bg: 'ws.sakuraBlush',
  color: 'ws.sakuraDark',
});
const rightGroup = css({
  flex: 'none',
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
});
const letterCount = css({
  fontFamily: 'wsMono',
  fontSize: '13px',
  fontWeight: 'black',
  fontVariantNumeric: 'tabular-nums',
  color: 'ws.jadeInk',
});

const countdownCss = css({
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '15px',
  color: 'ws.jadeInk',
  marginTop: '22px',
  fontVariantNumeric: 'tabular-nums',
});

const replayButton = css({
  width: '100%',
  marginTop: '24px',
  height: '54px',
  border: 'none',
  borderRadius: '15px',
  bg: 'ws.sakuraDark',
  color: 'white',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '18px',
  letterSpacing: '0.01em',
  cursor: 'pointer',
  boxShadow: '0 8px 18px rgba(212,93,131,0.32)',
  transition: 'transform 120ms, box-shadow 120ms',
  _active: { transform: 'translateY(1px)', boxShadow: '0 4px 12px rgba(212,93,131,0.30)' },
  _disabled: { bg: 'ws.khaki', opacity: 0.45, boxShadow: 'none', cursor: 'not-allowed' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const homeButton = css({
  width: '100%',
  marginTop: '12px',
  height: '48px',
  border: 'none',
  borderRadius: '13px',
  bg: 'transparent',
  color: 'ws.khaki',
  fontFamily: 'wsUi',
  fontWeight: 'bold',
  fontSize: '15px',
  cursor: 'pointer',
  _hover: { bg: 'rgba(76,72,36,0.08)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

export interface ResultatsScreenProps {
  readonly durationMs: number;
  readonly players: ReadonlyArray<Player>;
  readonly ownerSessionId: SessionId;
  readonly lockedPositions: ReadonlyArray<LockedCell>;
  // ADR-0113: cosmetic countdown to the server-driven auto-restart; `null` hides it. Server is the timer authority.
  readonly secondsUntilRematch: number | null;
  readonly isHost: boolean;
  readonly onRematchNow: () => void;
  readonly onCancelRematch: () => void;
  readonly onHome: () => void;
}

export function ResultatsScreen({
  durationMs,
  players,
  ownerSessionId,
  lockedPositions,
  secondsUntilRematch,
  isHost,
  onRematchNow,
  onCancelRematch,
  onHome,
}: ResultatsScreenProps) {
  const time = formatDuration(durationMs);
  const scores = tallyValidatedLetters(lockedPositions);
  const ranked = [...players].sort(
    (x, y) => (scores.get(y.sessionId) ?? 0) - (scores.get(x.sessionId) ?? 0),
  );
  return (
    <div className={wrap}>
      <div className={art}>{sparrowCelebrationScene()}</div>
      <h1 className={titleCss}>{t('v2.multiplayer.resultats.title')}</h1>
      <p className={subCss}>{t('v2.multiplayer.resultats.subtitle')}</p>

      <section className={timeCard} aria-label={t('v2.multiplayer.resultats.aria.timeSection')}>
        <p className={timeLabel}>{t('v2.multiplayer.resultats.timeLabel')}</p>
        <p className={timeValue} aria-label={t('v2.multiplayer.resultats.aria.finalTime', { time })}>{time}</p>
      </section>

      <section className={contribCard} aria-label={t('v2.multiplayer.resultats.aria.participants')}>
        <h2 className={contribTitle}>{t('v2.multiplayer.resultats.withCount', { total: players.length })}</h2>
        <ul className={list}>
          {ranked.map((p) => (
            <li key={p.sessionId} className={playerRow}>
              <PlayerAvatar sessionId={p.sessionId} pseudonym={p.pseudonym} size={34} />
              <span className={playerName}>{p.pseudonym}</span>
              <span className={rightGroup}>
                {p.sessionId === ownerSessionId ? <span className={badge}>{t('v2.multiplayer.host.badge')}</span> : null}
                <span className={letterCount}>
                  {t('v2.multiplayer.resultats.letterCount', { count: scores.get(p.sessionId) ?? 0 })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {secondsUntilRematch != null ? (
        <p className={countdownCss} role="timer">
          {t('v2.multiplayer.resultats.autoRestart', { seconds: secondsUntilRematch })}
        </p>
      ) : null}

      {isHost ? (
        <>
          <button type="button" className={replayButton} onClick={onRematchNow}>
            {t('v2.multiplayer.resultats.rematchNow')}
          </button>
          <button type="button" className={homeButton} onClick={onCancelRematch}>
            {t('v2.multiplayer.resultats.cancelRematch')}
          </button>
        </>
      ) : null}
      <button type="button" className={homeButton} onClick={onHome}>
        {t('v2.multiplayer.resultats.home')}
      </button>
    </div>
  );
}
