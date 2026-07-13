import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Instant, Player, Pseudonym, SessionId } from '@/domain/game';
import { ResultatsScreen, type ResultatsScreenProps } from '@/ui/v2/multiplayer/ResultatsScreen';
import { expectAxeClean } from '@/test/a11y';

const ownerId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const guestId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;

const players: ReadonlyArray<Player> = [
  { sessionId: ownerId, pseudonym: 'Léa' as Pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant },
  { sessionId: guestId, pseudonym: 'Amie' as Pseudonym, joinedAt: '2026-06-27T15:31:00Z' as Instant },
];

function renderResultats(overrides: Partial<ResultatsScreenProps> = {}) {
  const props: ResultatsScreenProps = {
    // 7 min 24 s.
    durationMs: 7 * 60 * 1000 + 24 * 1000,
    players,
    ownerSessionId: ownerId,
    lockedPositions: [],
    secondsUntilRematch: 10,
    isHost: false,
    onRematchNow: vi.fn(),
    onCancelRematch: vi.fn(),
    onHome: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ResultatsScreen {...props} />) };
}

describe('v2 ResultatsScreen', () => {
  it('shows the celebratory title and the final time', () => {
    renderResultats();
    expect(screen.getByRole('heading', { level: 1, name: 'Résolue !' })).toBeTruthy();
    expect(screen.getByText('07:24')).toBeTruthy();
  });

  it('renders hours when the duration exceeds an hour', () => {
    renderResultats({ durationMs: 60 * 60 * 1000 + 5 * 60 * 1000 + 9 * 1000 });
    expect(screen.getByText('01:05:09')).toBeTruthy();
  });

  it('lists every contributor with the owner badge', () => {
    renderResultats();
    expect(screen.getByText('Avec (2)')).toBeTruthy();
    expect(screen.getByText('Léa')).toBeTruthy();
    expect(screen.getByText('Amie')).toBeTruthy();
    // Only the owner row carries the "Hôte" badge.
    expect(screen.getAllByText('Hôte')).toHaveLength(1);
  });

  it('shows the auto-restart countdown for everyone (ADR-0113)', () => {
    renderResultats({ isHost: false, secondsUntilRematch: 7 });
    expect(screen.getByText(/Nouvelle partie dans 7/)).toBeTruthy();
  });

  it('hides the countdown when secondsUntilRematch is null', () => {
    renderResultats({ secondsUntilRematch: null });
    expect(screen.queryByText(/Nouvelle partie dans/)).toBeNull();
  });

  it('host sees Rejouer maintenant / Annuler and they fire their handlers', () => {
    const { props } = renderResultats({ isHost: true });
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer maintenant' }));
    expect(props.onRematchNow).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.onCancelRematch).toHaveBeenCalledOnce();
  });

  it('hides the host controls for a guest', () => {
    renderResultats({ isHost: false });
    expect(screen.queryByRole('button', { name: 'Rejouer maintenant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('everyone keeps the Accueil button, which fires onHome', () => {
    const { props } = renderResultats({ isHost: false });
    fireEvent.click(screen.getByRole('button', { name: /accueil/i }));
    expect(props.onHome).toHaveBeenCalledOnce();
  });

  it('shows each contributor validated-letter count', () => {
    renderResultats({
      lockedPositions: [
        { row: 0, column: 0, lockedBy: ownerId },
        { row: 0, column: 1, lockedBy: ownerId },
        { row: 1, column: 0, lockedBy: guestId },
      ],
    });
    expect(screen.getByText('2 lettres')).toBeTruthy();
    expect(screen.getByText('1 lettre')).toBeTruthy();
  });

  it('ranks players by validated-letter score descending', () => {
    renderResultats({
      lockedPositions: [
        { row: 0, column: 0, lockedBy: guestId },
        { row: 0, column: 1, lockedBy: guestId },
        { row: 1, column: 0, lockedBy: ownerId },
      ],
    });
    const names = screen.getAllByText(/^(Léa|Amie)$/).map((n) => n.textContent);
    expect(names).toEqual(['Amie', 'Léa']); // guest 2 > owner 1
  });

  it('is axe-clean (ADR-0050)', async () => {
    // Slotted into PhoneShell's <main> in production; mirror that here so axe sees a landmark.
    const { container } = render(
      <main>
        <ResultatsScreen
          durationMs={444000}
          players={players}
          ownerSessionId={ownerId}
          lockedPositions={[]}
          secondsUntilRematch={10}
          isHost
          onRematchNow={vi.fn()}
          onCancelRematch={vi.fn()}
          onHome={vi.fn()}
        />
      </main>,
    );
    await expectAxeClean(container);
  });
});
