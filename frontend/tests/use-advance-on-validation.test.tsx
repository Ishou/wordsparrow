import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Cell, Puzzle } from '@/domain';
import { AnnouncerProvider } from '@/ui/components/a11y/Announcer';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';
import { posKey } from '@/ui/components/grid/playLayout';
import { useAdvanceOnValidation } from '@/ui/components/grid/useAdvanceOnValidation';

const L = (row: number, col: number): Cell => ({ kind: 'letter', position: { row, col }, entry: '' });

// Two stacked across words: A = (0,1)(0,2), B = (1,1)(1,2).
const PUZZLE: Puzzle = {
  id: 'test',
  title: 'test',
  language: 'fr',
  width: 3,
  height: 2,
  hintsAllowed: 0,
  hintsRemaining: 0,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'mot-A', arrow: 'right' }] },
    L(0, 1),
    L(0, 2),
    { kind: 'definition', position: { row: 1, col: 0 }, clues: [{ text: 'mot-B', arrow: 'right' }] },
    L(1, 1),
    L(1, 2),
  ],
};

const WORD_A = [posKey(0, 1), posKey(0, 2)];

interface Handles {
  readonly validate: (keys: string[]) => void;
  readonly runBeat: () => void;
}

// Minimal screen-shaped harness: real grid nav + real letter inputs (so the hook's DOM focus works),
// validatedPositions driven imperatively, and the board beat simulated by calling onBeatComplete.
function Harness({ completed = false, onReady }: { completed?: boolean; onReady: (h: Handles) => void }) {
  const [validated, setValidated] = useState<ReadonlySet<string>>(() => new Set());
  const nav = useGridNavigation(PUZZLE, {
    isCellValidated: (row, col) => validated.has(posKey(row, col)),
  });
  const advance = useAdvanceOnValidation({
    puzzle: PUZZLE,
    nav,
    validatedPositions: validated,
    currentClue: nav.currentClue,
    completed,
  });
  onReady({
    validate: (keys) => act(() => setValidated((prev) => new Set([...prev, ...keys]))),
    runBeat: () => act(() => advance.onBeatComplete()),
  });
  const letters = PUZZLE.cells.filter((c) => c.kind === 'letter');
  return (
    <div>
      {letters.map((c) => (
        <input
          key={posKey(c.position.row, c.position.col)}
          ref={nav.registerCellRef}
          data-cell-kind="letter"
          data-row={c.position.row}
          data-col={c.position.col}
          readOnly={validated.has(posKey(c.position.row, c.position.col))}
          onFocus={nav.handleFocus}
          onKeyDown={nav.handleKeyDown}
          onInput={nav.handleInput}
        />
      ))}
    </div>
  );
}

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);

function renderHarness(completed = false) {
  let handles!: Handles;
  const { container } = render(
    <AnnouncerProvider>
      <Harness completed={completed} onReady={(h) => { handles = h; }} />
    </AnnouncerProvider>,
  );
  return { container, ...handles };
}

describe('useAdvanceOnValidation', () => {
  it('advances to the next clue after the focused word fully validates (post-beat)', () => {
    const { container, validate, runBeat } = renderHarness();
    // Focus the last cell of word A, then validate the whole word this tick.
    const lastA = inputAt(container, 0, 2)!;
    act(() => lastA.focus());
    expect(document.activeElement).toBe(lastA);

    validate(WORD_A);
    // Celebration is queued: focus has NOT advanced until the board's beat completes.
    expect(document.activeElement).toBe(lastA);

    runBeat();
    // After the beat the cursor jumps to word B's first cell (1,1).
    expect(document.activeElement).toBe(inputAt(container, 1, 1));
  });

  it('does NOT advance when only part of the word has validated', () => {
    const { container, validate, runBeat } = renderHarness();
    const lastA = inputAt(container, 0, 2)!;
    act(() => lastA.focus());

    // Only the focused cell validates; the rest of word A is unsolved.
    validate([posKey(0, 2)]);
    runBeat();

    // Partial solve keeps focus put — no jump to word B.
    expect(document.activeElement).toBe(lastA);
  });

  it('suppresses advancing once the whole grid is completed', () => {
    const { container, validate, runBeat } = renderHarness(true);
    const lastA = inputAt(container, 0, 2)!;
    act(() => lastA.focus());

    validate(WORD_A);
    runBeat();

    // completed === true: the next-clue advance is suppressed.
    expect(document.activeElement).toBe(lastA);
  });
});
