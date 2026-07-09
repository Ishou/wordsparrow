import { render, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Position, Puzzle } from '@/domain';
import { Grid } from '@/ui/components/grid';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';

const L = (row: number, col: number, entry = ''): Cell =>
  ({ kind: 'letter', position: { row, col }, entry });

// 5×4 grid. Def(0,0)→ owns across word (0,1)(0,2)(0,3)(0,4).
// Dual def at (2,0): right owns (2,1)(2,2)(2,3)(2,4); down owns (3,0) only
// (grid is 4 rows tall). Row 1 and the rest are plain letters.
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

// Apply a partial entry to a letter cell in the base puzzle.
const withEntry = (row: number, col: number, entry: string): Puzzle => {
  const p = basePuzzle();
  return {
    ...p,
    cells: p.cells.map((c) =>
      c.kind === 'letter' && c.position.row === row && c.position.col === col ? { ...c, entry } : c,
    ),
  };
};

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
const defAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLElement>(`[data-cell-kind="definition"][data-row="${row}"][data-col="${col}"]`)!;

describe('Def-cell tap focuses its word', () => {
  it('tapping a single-def cell focuses the first cell of its word', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 1));
  });

  it('landing skips an already-typed cell to the first empty one', () => {
    const { container } = render(<Grid puzzle={withEntry(0, 1, 'X')} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 2));
  });

  it('landing skips a validated (locked) cell', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} validatedPositions={new Set(['0,1'])} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 2));
  });

  it('tapping a dual-def cell focuses the first clue (clues[0]) word', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    fireEvent.click(defAt(container, 2, 0));
    expect(document.activeElement).toBe(inputAt(container, 2, 1));
  });

  it('does nothing while a pan gesture is in progress', () => {
    const { result } = renderHook(() =>
      useGridNavigation(basePuzzle(), { isPanning: () => true }),
    );
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue).toBeNull();
  });

  it('handler focuses the def word when not panning (hook unit)', () => {
    const { result } = renderHook(() => useGridNavigation(basePuzzle()));
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue?.clue.text).toBe('across');
  });
});

describe('Dual-def cell single-tap toggle', () => {
  it('first tap focuses clue #1 (across); repeat tap toggles to clue #2 (down); third tap toggles back', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    const dual = () => defAt(container, 2, 0);

    // clue #1 = across (right) → owns (2,1); land there.
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 2, 1));

    // repeat tap → clue #2 = down → owns (3,0); land there.
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 3, 0));

    // third tap → back to clue #1 (2,1).
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 2, 1));
  });

  it('tapping a dual-def cell after focusing an unrelated word starts at clue #1', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    // Focus the top across word first (unrelated to the dual cell at (2,0)).
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 1));
    // First tap on the dual cell → clue #1 (across), not the down clue.
    fireEvent.click(defAt(container, 2, 0));
    expect(document.activeElement).toBe(inputAt(container, 2, 1));
  });
});
