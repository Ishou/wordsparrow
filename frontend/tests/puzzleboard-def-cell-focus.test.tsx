import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Puzzle } from '@/domain';
import { AnnouncerProvider } from '@/ui/components/a11y/Announcer';
import { PuzzleBoard } from '@/ui/components/grid/PuzzleBoard';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';

// Same shape as the Grid-level tap-focus tests, but rendered through the component
// PuzzleBoard/DefCell that the real /play and coop surfaces actually mount.
const L = (row: number, col: number, entry = ''): Cell =>
  ({ kind: 'letter', position: { row, col }, entry });

// 5×4 grid. Def(0,0)→ owns across word (0,1)(0,2)(0,3)(0,4). Dual def at (2,0):
// right owns (2,1)(2,2)(2,3)(2,4); down owns (3,0) only.
const basePuzzle = (): Puzzle => {
  const cells: Cell[] = [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'across', arrow: 'right' }] },
    L(0, 1), L(0, 2), L(0, 3), L(0, 4),
    L(1, 0), L(1, 1), L(1, 2), L(1, 3), L(1, 4),
    { kind: 'definition', position: { row: 2, col: 0 }, clues: [{ text: 'dual-h', arrow: 'right' }, { text: 'dual-v', arrow: 'down' }] },
    L(2, 1), L(2, 2), L(2, 3), L(2, 4),
    L(3, 0), L(3, 1), L(3, 2), L(3, 3), L(3, 4),
  ];
  return { id: 't', title: 't', language: 'fr', width: 5, height: 4, hintsAllowed: 3, hintsRemaining: 3, cells };
};

const inputAt = (row: number, col: number) =>
  document.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`)!;

function Harness({ puzzle }: { readonly puzzle: Puzzle }) {
  const nav = useGridNavigation(puzzle);
  return (
    <AnnouncerProvider>
      <PuzzleBoard puzzle={puzzle} nav={nav} validatedPositions={new Set()} entryAt={new Map()} />
    </AnnouncerProvider>
  );
}

describe('PuzzleBoard wires def-cell tap-to-focus through the live DefCell component', () => {
  it('tapping a single-def cell focuses the first cell of its word', () => {
    render(<Harness puzzle={basePuzzle()} />);
    fireEvent.click(screen.getByText('across').closest('[data-defcell]')!);
    expect(document.activeElement).toBe(inputAt(0, 1));
  });

  it('first tap on a dual-def cell focuses clue #1; repeat tap toggles to clue #2', () => {
    render(<Harness puzzle={basePuzzle()} />);
    const dual = () => screen.getByText('dual-h').closest('[data-defcell]')!;
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(2, 1));
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(3, 0));
  });
});
