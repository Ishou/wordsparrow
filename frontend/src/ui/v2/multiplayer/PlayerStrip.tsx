import { css, cx } from 'styled-system/css';
import type { Player, SessionId } from '@/domain/game';
import { PlayerAvatar } from './PlayerAvatar';

// ADR-0072 compact co-op roster: dumb — takes the player list + derived presence sets, renders an avatar + status dot per peer.

const strip = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
});
const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  bg: 'ws.glass',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid token(colors.ws.glassBorder)',
  borderRadius: '999px',
  padding: '3px 9px 3px 3px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
});
const name = css({
  fontFamily: 'wsUi',
  fontSize: '12.5px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  maxWidth: '88px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
const dot = css({
  flex: 'none',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
});
const dotConnected = css({ background: 'ws.statusOnline' });
const dotTyping = css({ background: 'ws.sakuraDark', animation: 'wsPulse 1s ease-in-out infinite' });
const dotIdle = css({ background: 'ws.statusIdle' });
const dotLost = css({ background: 'ws.statusLost' });

export interface PlayerStripProps {
  readonly players: ReadonlyArray<Player>;
  readonly currentSessionId: SessionId;
  readonly typingSessionIds: ReadonlySet<SessionId>;
  readonly idleSessionIds: ReadonlySet<SessionId>;
  readonly disconnectingSessionIds: ReadonlySet<SessionId>;
}

function statusFor(
  sessionId: SessionId,
  typing: ReadonlySet<SessionId>,
  idle: ReadonlySet<SessionId>,
  lost: ReadonlySet<SessionId>,
): { cls: string; label: string } {
  if (lost.has(sessionId)) return { cls: dotLost, label: 'déconnecté' };
  if (typing.has(sessionId)) return { cls: dotTyping, label: 'en train d’écrire' };
  if (idle.has(sessionId)) return { cls: dotIdle, label: 'inactif' };
  return { cls: dotConnected, label: 'en ligne' };
}

export function PlayerStrip({
  players,
  currentSessionId,
  typingSessionIds,
  idleSessionIds,
  disconnectingSessionIds,
}: PlayerStripProps) {
  return (
    <ul className={strip} aria-label="Joueurs">
      {players.map((p) => {
        const isSelf = p.sessionId === currentSessionId;
        // Self always reads "en ligne" — peer presence sets exclude the local session.
        const status = isSelf
          ? { cls: dotConnected, label: 'en ligne' }
          : statusFor(p.sessionId, typingSessionIds, idleSessionIds, disconnectingSessionIds);
        return (
          <li key={p.sessionId} className={chip}>
            <PlayerAvatar sessionId={p.sessionId} pseudonym={p.pseudonym} size={24} />
            <span className={name}>
              {p.pseudonym}
              {isSelf ? ' (toi)' : ''}
            </span>
            <span
              className={cx(dot, status.cls)}
              role="img"
              aria-label={`${p.pseudonym} : ${status.label}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
