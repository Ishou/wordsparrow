import { css } from 'styled-system/css';
import type { SessionId } from '@/domain/game';
import { playerColorVars, playerInitial } from '@/ui/lib/playerColor';

// Per-player colour disc + initial — one source for the roster / salon / résultats avatars.
const avatar = css({
  flex: 'none',
  borderRadius: '50%',
  background: 'var(--player-color)',
  // The disc never themes (pastel in both modes), so the initial uses the recipe's on-color, not a theming token.
  color: 'var(--player-on)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsUi',
  fontWeight: 'black',
});

export interface PlayerAvatarProps {
  readonly sessionId: SessionId;
  readonly pseudonym: string;
  // Diameter in px; the initial scales with it.
  readonly size?: number;
}

export function PlayerAvatar({ sessionId, pseudonym, size = 34 }: PlayerAvatarProps) {
  return (
    <span
      className={avatar}
      style={{ ...playerColorVars(sessionId), width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {playerInitial(pseudonym)}
    </span>
  );
}
