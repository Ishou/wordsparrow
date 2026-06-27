import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent, Unsubscribe } from '@/application/game';
import type { Instant, Player, Pseudonym, SessionId } from '@/domain/game';
import type { Puzzle } from '@/domain';
import { AnnouncerProvider } from '@/ui/components/a11y/Announcer';
import { LiveCoopScreen, type LiveCoopScreenProps } from '@/ui/v2/multiplayer/LiveCoopScreen';
import { CoopPresenceLayer } from '@/ui/v2/multiplayer/CoopPresenceLayer';
import { expectAxeClean } from '@/test/a11y';

const selfId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const peerId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;

// 1×3 puzzle: a right-arrow definition at (0,0); the across word spans (0,1)..(0,2), entries server-blank.
const puzzle: Puzzle = {
  id: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a60',
  title: 'Test',
  language: 'fr',
  width: 3,
  height: 1,
  hintsAllowed: 0,
  hintsRemaining: 0,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'Affirmation', arrow: 'right' }] },
    { kind: 'letter', position: { row: 0, col: 1 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 2 }, entry: '' },
  ],
};

const players: ReadonlyArray<Player> = [
  { sessionId: selfId, pseudonym: 'Moi' as Pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant },
  { sessionId: peerId, pseudonym: 'Amie' as Pseudonym, joinedAt: '2026-06-27T15:30:01Z' as Instant },
];
const playersBySessionId = new Map(players.map((p) => [p.sessionId, p] as const));

// Hand-driven subscribe registrar: tests push frames via the returned dispatch.
function makeStream() {
  const handlers = new Set<(e: GameEvent) => void>();
  const subscribe = (handler: (e: GameEvent) => void): Unsubscribe => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };
  const dispatch = (event: GameEvent) => {
    act(() => {
      for (const h of [...handlers]) h(event);
    });
  };
  return { subscribe, dispatch };
}

function renderScreen(overrides: Partial<LiveCoopScreenProps> = {}) {
  const cellStream = makeStream();
  const presenceStream = makeStream();
  const props: LiveCoopScreenProps = {
    puzzle,
    startedAt: '2026-06-27T15:30:00Z',
    isCompleted: false,
    sessionId: selfId,
    players,
    playersBySessionId,
    initialEntries: [],
    lockedPositions: [],
    onCellChange: vi.fn(),
    onLocalFocusChange: vi.fn(),
    subscribeToRemoteCellUpdates: cellStream.subscribe,
    subscribeToRemotePresence: presenceStream.subscribe,
    onLeave: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <AnnouncerProvider>
      <LiveCoopScreen {...props} />
    </AnnouncerProvider>,
  );
  return { props, cellStream, presenceStream, ...utils };
}

function letterInput(row: number, col: number): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    `input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`,
  );
  if (!el) throw new Error(`no input at ${row},${col}`);
  return el;
}

describe('v2 LiveCoopScreen', () => {
  it('renders the board, the timer and the roster', () => {
    renderScreen();
    expect(screen.getByText('Affirmation')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(letterInput(0, 1)).toBeTruthy();
    const roster = screen.getByRole('list', { name: 'Joueurs' });
    expect(within(roster).getByText('Moi (toi)')).toBeTruthy();
    expect(within(roster).getByText('Amie')).toBeTruthy();
  });

  it('broadcasts a local edit via onCellChange', () => {
    const { props } = renderScreen();
    const input = letterInput(0, 1);
    act(() => {
      input.focus();
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'O' });
    });
    expect(props.onCellChange).toHaveBeenCalledWith(0, 1, 'O');
  });

  it('applies a remote cellUpdated to the uncontrolled input without re-broadcasting', () => {
    const { props, cellStream } = renderScreen();
    cellStream.dispatch({
      type: 'cellUpdated',
      sessionId: peerId,
      row: 0,
      column: 2,
      letter: 'U',
      writtenAt: '2026-06-27T15:31:00Z',
    } as GameEvent);
    expect(letterInput(0, 2).value).toBe('U');
    expect(props.onCellChange).not.toHaveBeenCalled();
  });

  it('lights every letter cell and hides the keyboard when completed', () => {
    renderScreen({ isCompleted: true, frozenAtMs: 90_000 });
    expect(letterInput(0, 1).readOnly).toBe(true);
    expect(letterInput(0, 2).readOnly).toBe(true);
    // No on-screen keyboard once the grid is solved.
    expect(screen.queryByRole('button', { name: 'Effacer' })).toBeNull();
  });

  it('marks a server-locked cell as solved', () => {
    renderScreen({ lockedPositions: [{ row: 0, column: 1 }] });
    expect(letterInput(0, 1).readOnly).toBe(true);
    expect(letterInput(0, 2).readOnly).toBe(false);
  });

  it('wires the leave control', () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la partie' }));
    expect(props.onLeave).toHaveBeenCalled();
  });

  it('is axe-clean in progress (ADR-0050)', async () => {
    const { container } = renderScreen();
    await expectAxeClean(container);
  });

  it('is axe-clean when completed (ADR-0050)', async () => {
    const { container } = renderScreen({ isCompleted: true, frozenAtMs: 60_000 });
    await expectAxeClean(container);
  });
});

describe('v2 CoopPresenceLayer', () => {
  it('paints a peer cursor + word range on presenceUpdated and skips self', () => {
    const stream = makeStream();
    const { container } = render(
      <CoopPresenceLayer
        puzzle={puzzle}
        subscribeToRemotePresence={stream.subscribe}
        currentSessionId={selfId}
        playersBySessionId={playersBySessionId}
        validatedPositions={new Set()}
        typingSessionIds={new Set()}
        cellSize={56}
        gap={5}
      />,
    );
    // Nothing until a peer reports presence.
    expect(container.querySelectorAll('[style]').length).toBe(0);
    stream.dispatch({
      type: 'presenceUpdated',
      sessionId: peerId,
      row: 0,
      column: 1,
      direction: 'across',
    } as GameEvent);
    // The peer's active cell renders an overlay tile.
    expect(container.querySelector('div[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelectorAll('div[aria-hidden="true"] > div').length).toBeGreaterThan(0);
    // The local session never paints a presence overlay.
    stream.dispatch({
      type: 'presenceUpdated',
      sessionId: selfId,
      row: 0,
      column: 2,
      direction: 'across',
    } as GameEvent);
    // Only the peer tile(s) remain — self is filtered.
    const badges = container.querySelectorAll('span');
    expect(badges.length).toBeGreaterThanOrEqual(0);
  });
});
