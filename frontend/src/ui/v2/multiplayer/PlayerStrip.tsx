import { css, cx } from 'styled-system/css';
import type { Player, PlayerId, SessionId } from '@/domain/game';
import { t } from '@/ui/i18n';
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
const count = css({
  flex: 'none',
  fontFamily: 'wsMono',
  fontSize: '11.5px',
  fontWeight: 'black',
  fontVariantNumeric: 'tabular-nums',
  color: 'ws.jadeInk',
  opacity: 0.75,
  minWidth: '12px',
  textAlign: 'center',
});

export interface PlayerStripProps {
  readonly players: ReadonlyArray<Player>;
  // ADR-0066 (e): identity/score/"you"/colour key on `playerId`; presence sets stay per-`sessionId` (transport).
  readonly currentPlayerId: PlayerId;
  readonly typingSessionIds: ReadonlySet<SessionId>;
  readonly idleSessionIds: ReadonlySet<SessionId>;
  readonly disconnectingSessionIds: ReadonlySet<SessionId>;
  readonly scoresByPlayerId?: ReadonlyMap<PlayerId, number>;
}

function statusFor(
  sessionId: SessionId,
  typing: ReadonlySet<SessionId>,
  idle: ReadonlySet<SessionId>,
  lost: ReadonlySet<SessionId>,
): { cls: string; label: string } {
  if (lost.has(sessionId)) return { cls: dotLost, label: t('lobby.playerList.aria.disconnected') };
  if (typing.has(sessionId)) return { cls: dotTyping, label: t('v2.multiplayer.presence.typing') };
  if (idle.has(sessionId)) return { cls: dotIdle, label: t('lobby.playerList.aria.idle') };
  return { cls: dotConnected, label: t('v2.multiplayer.presence.online') };
}

export function PlayerStrip({
  players,
  currentPlayerId,
  typingSessionIds,
  idleSessionIds,
  disconnectingSessionIds,
  scoresByPlayerId,
}: PlayerStripProps) {
  return (
    <ul className={strip} aria-label={t('v2.multiplayer.presence.aria.players')}>
      {players.map((p) => {
        const isSelf = p.playerId === currentPlayerId;
        // Self always reads "en ligne" — peer presence sets exclude the local session.
        const status = isSelf
          ? { cls: dotConnected, label: t('v2.multiplayer.presence.online') }
          : statusFor(p.sessionId, typingSessionIds, idleSessionIds, disconnectingSessionIds);
        const score = scoresByPlayerId?.get(p.playerId) ?? 0;
        return (
          <li key={p.playerId} className={chip}>
            <PlayerAvatar colorId={p.playerId} pseudonym={p.pseudonym} size={24} />
            <span className={name}>
              {p.pseudonym}
              {isSelf ? t('v2.multiplayer.presence.youSuffix') : ''}
            </span>
            <span
              className={count}
              role="img"
              aria-label={t('v2.multiplayer.presence.aria.score', { name: p.pseudonym, count: score })}
            >
              <span aria-hidden="true">{score}</span>
            </span>
            <span
              className={cx(dot, status.cls)}
              role="img"
              aria-label={t('v2.multiplayer.presence.aria.status', { name: p.pseudonym, status: status.label })}
            />
          </li>
        );
      })}
    </ul>
  );
}
