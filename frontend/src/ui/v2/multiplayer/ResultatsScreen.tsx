import { css } from 'styled-system/css';
import type { Player, SessionId } from '@/domain/game';
import { sparrowCelebrationScene } from '@/ui/v2/SparrowScenes';
import { PlayerAvatar } from './PlayerAvatar';

// ADR-0072 co-op finish: no scores — versus mode is a deferred follow-up.

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;

const twoDigit = new Intl.NumberFormat('fr-FR', {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

function formatDuration(durationMs: number): string {
  const ms = Math.max(0, durationMs);
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor(ms / SECOND_MS) % 60;
  const mm = twoDigit.format(minutes);
  const ss = twoDigit.format(seconds);
  return hours > 0 ? `${twoDigit.format(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 8px 8px' });
const art = css({ display: 'flex', justifyContent: 'center', marginBottom: '12px' });
const titleCss = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '30px', lineHeight: '1.05', color: 'ws.jadeInk' });
const subCss = css({ fontFamily: 'wsUi', fontWeight: 'semibold', fontSize: '15px', lineHeight: '1.45', color: 'ws.khaki', opacity: 0.85, marginTop: '6px', maxWidth: '300px' });

const timeCard = css({
  marginTop: '22px',
  bg: 'rgba(255,255,255,0.62)',
  borderRadius: '18px',
  padding: '16px 28px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
});
const timeLabel = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'black', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.85 });
const timeValue = css({ fontFamily: 'wsMono', fontWeight: 'semibold', fontSize: '40px', color: 'ws.jadeInk', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', marginTop: '4px', lineHeight: '1' });

const contribCard = css({
  width: '100%',
  marginTop: '18px',
  bg: 'rgba(255,255,255,0.62)',
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
  marginLeft: 'auto',
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
  readonly isReplaying?: boolean;
  readonly onReplay: () => void;
  readonly onHome: () => void;
}

export function ResultatsScreen({
  durationMs,
  players,
  ownerSessionId,
  isReplaying = false,
  onReplay,
  onHome,
}: ResultatsScreenProps) {
  const time = formatDuration(durationMs);
  return (
    <div className={wrap}>
      <div className={art}>{sparrowCelebrationScene()}</div>
      <h1 className={titleCss}>Résolue !</h1>
      <p className={subCss}>Grille bouclée ensemble. Belle équipe !</p>

      <section className={timeCard} aria-label="Temps final">
        <p className={timeLabel}>Temps</p>
        <p className={timeValue} aria-label={`Temps final ${time}`}>{time}</p>
      </section>

      <section className={contribCard} aria-label="Participants">
        <h2 className={contribTitle}>Avec ({players.length})</h2>
        <ul className={list}>
          {players.map((p) => (
            <li key={p.sessionId} className={playerRow}>
              <PlayerAvatar sessionId={p.sessionId} pseudonym={p.pseudonym} size={34} />
              <span className={playerName}>{p.pseudonym}</span>
              {p.sessionId === ownerSessionId ? <span className={badge}>Hôte</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className={replayButton}
        onClick={onReplay}
        disabled={isReplaying}
        aria-busy={isReplaying || undefined}
      >
        {isReplaying ? 'Création…' : 'Rejouer'}
      </button>
      <button type="button" className={homeButton} onClick={onHome}>
        Retour à l&apos;accueil
      </button>
    </div>
  );
}
