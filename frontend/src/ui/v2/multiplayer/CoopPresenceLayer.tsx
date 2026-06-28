import { useMemo } from 'react';
import { css } from 'styled-system/css';
import type { GameEvent, Unsubscribe } from '@/application/game';
import type { Position, Puzzle } from '@/domain';
import type { Player, SessionId } from '@/domain/game';
import {
  buildCellPresenceMap,
  useRemotePresences,
} from '@/ui/components/grid/PresenceOverlay';

// ADR-0018 §"Presence" / ADR-0072: paints each peer's cursor + word on the v2 board from the remote presence stream.

const layer = css({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 2,
});
// color-mix (not element opacity) so the badge child stays fully opaque against the v2 light --player-color
const wordTint = css({
  position: 'absolute',
  borderRadius: '9px',
  background: 'color-mix(in srgb, var(--player-color) 32%, transparent)',
});
const activeRing = css({
  position: 'absolute',
  borderRadius: '9px',
  boxShadow: 'inset 0 0 0 2.5px var(--player-color)',
  background: 'color-mix(in srgb, var(--player-color) 45%, transparent)',
});
const badge = css({
  position: 'absolute',
  top: '-7px',
  right: '-7px',
  minWidth: '16px',
  height: '16px',
  paddingInline: '3px',
  borderRadius: '999px',
  background: 'var(--player-color)',
  color: 'ws.jadeInk',
  fontFamily: 'wsUi',
  fontSize: '10px',
  fontWeight: 'black',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 1px 3px rgba(33,75,64,0.3)',
});

export interface CoopPresenceLayerProps {
  readonly puzzle: Puzzle;
  readonly subscribeToRemotePresence: (handler: (event: GameEvent) => void) => Unsubscribe;
  readonly currentSessionId: SessionId;
  readonly playersBySessionId: ReadonlyMap<SessionId, Player>;
  readonly validatedPositions: ReadonlySet<string>;
  readonly typingSessionIds: ReadonlySet<SessionId>;
  // Fixed board geometry (px) shared with the LiveCoopScreen board grid.
  readonly cellSize: number;
  readonly gap: number;
}

export function CoopPresenceLayer({
  puzzle,
  subscribeToRemotePresence,
  currentSessionId,
  playersBySessionId,
  validatedPositions,
  typingSessionIds,
  cellSize,
  gap,
}: CoopPresenceLayerProps) {
  const remotePresences = useRemotePresences(subscribeToRemotePresence, currentSessionId);

  // localCursor null: the grid owns the local cursor here, so only remote peers feed the overlay.
  const cellPresence = useMemo(
    () =>
      buildCellPresenceMap({
        puzzle,
        remotePresences,
        localCursor: null,
        playersBySessionId,
        currentSessionId,
        validatedPositions,
        typingSessionIds,
      }),
    [puzzle, remotePresences, playersBySessionId, currentSessionId, validatedPositions, typingSessionIds],
  );

  if (cellPresence.size === 0) return null;
  const stride = cellSize + gap;
  const tiles: Array<{ key: string; pos: Position; vars: Record<string, string>; role: 'active' | 'word'; badge?: string }> = [];
  for (const [key, presence] of cellPresence) {
    const [row, col] = key.split(',').map(Number);
    tiles.push({ key, pos: { row, col }, vars: presence.vars, role: presence.role, badge: presence.badge });
  }

  return (
    <div className={layer} aria-hidden="true">
      {tiles.map((t) => (
        <div
          key={t.key}
          className={t.role === 'active' ? activeRing : wordTint}
          style={{
            ...t.vars,
            left: t.pos.col * stride,
            top: t.pos.row * stride,
            width: cellSize,
            height: cellSize,
          }}
        >
          {t.role === 'active' && t.badge ? <span className={badge}>{t.badge}</span> : null}
        </div>
      ))}
    </div>
  );
}
