import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Instant, Player, Pseudonym, SessionId } from '@/domain/game';
import { PlayerStrip } from '@/ui/v2/multiplayer/PlayerStrip';

const a = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const b = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;
const players: ReadonlyArray<Player> = [
  { sessionId: a, pseudonym: 'Alex' as Pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant },
  { sessionId: b, pseudonym: 'Sam' as Pseudonym, joinedAt: '2026-06-27T15:31:00Z' as Instant },
];
const empty = new Set<SessionId>();

function renderStrip(scores?: ReadonlyMap<SessionId, number>) {
  return render(
    <PlayerStrip
      players={players}
      currentSessionId={a}
      typingSessionIds={empty}
      idleSessionIds={empty}
      disconnectingSessionIds={empty}
      scoresBySessionId={scores}
    />,
  );
}

describe('PlayerStrip score', () => {
  it('renders each player validated-letter count', () => {
    renderStrip(new Map([[a, 12], [b, 5]]));
    expect(screen.getByLabelText('Alex : 12 lettres validées')).toBeTruthy();
    expect(screen.getByLabelText('Sam : 5 lettres validées')).toBeTruthy();
  });

  it('shows 0 for a player absent from the score map', () => {
    renderStrip(new Map([[a, 3]]));
    expect(screen.getByLabelText('Sam : 0 lettre validée')).toBeTruthy();
  });

  it('defaults every score to 0 when no map is provided', () => {
    renderStrip(undefined);
    expect(screen.getByLabelText('Alex : 0 lettre validée')).toBeTruthy();
  });

  it('does not reorder chips by score', () => {
    renderStrip(new Map([[a, 1], [b, 99]]));
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Alex');
    expect(items[1].textContent).toContain('Sam');
  });
});
