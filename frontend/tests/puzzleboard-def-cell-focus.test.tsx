import { render, fireEvent, screen, renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Position, Puzzle } from '@/domain';
import { AnnouncerProvider } from '@/ui/components/a11y/Announcer';
import { PuzzleBoard } from '@/ui/components/grid/PuzzleBoard';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';

// Rendered through PuzzleBoard/DefCell — the components the real /play and coop
// surfaces actually mount (Grid/Cell are only the design-system gallery).
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
const defByText = (text: string) => screen.getByText(text).closest('[data-defcell]')!;
const keycapAt = (row: number, col: number) =>
  document.querySelector<HTMLElement>(`div[data-row="${row}"][data-col="${col}"] [data-cell-state]`)!;

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

function Harness({
  puzzle,
  validated = EMPTY_SET,
  entries = EMPTY_MAP,
}: {
  readonly puzzle: Puzzle;
  readonly validated?: ReadonlySet<string>;
  readonly entries?: ReadonlyMap<string, string>;
}) {
  const nav = useGridNavigation(puzzle, {
    isCellValidated: (r, c) => validated.has(`${r},${c}`),
  });
  return (
    <AnnouncerProvider>
      <PuzzleBoard puzzle={puzzle} nav={nav} validatedPositions={validated} entryAt={entries} />
    </AnnouncerProvider>
  );
}

describe('PuzzleBoard wires def-cell tap-to-focus through the live DefCell component', () => {
  it('tapping a single-def cell focuses the first cell of its word', () => {
    render(<Harness puzzle={basePuzzle()} />);
    fireEvent.click(defByText('across'));
    expect(document.activeElement).toBe(inputAt(0, 1));
  });

  it('landing skips an already-typed cell to the first empty one', () => {
    render(<Harness puzzle={basePuzzle()} entries={new Map([['0,1', 'X']])} />);
    fireEvent.click(defByText('across'));
    expect(document.activeElement).toBe(inputAt(0, 2));
  });

  it('landing skips a validated (locked) cell', () => {
    render(<Harness puzzle={basePuzzle()} validated={new Set(['0,1'])} />);
    fireEvent.click(defByText('across'));
    expect(document.activeElement).toBe(inputAt(0, 2));
  });

  it('a fully-locked word lands on its first (read-only) cell', () => {
    render(<Harness puzzle={basePuzzle()} validated={new Set(['0,1', '0,2', '0,3', '0,4'])} />);
    fireEvent.click(defByText('across'));
    expect(document.activeElement).toBe(inputAt(0, 1));
    expect(inputAt(0, 1).readOnly).toBe(true);
  });

  it('first tap on a dual-def cell focuses clue #1; repeat toggles to clue #2; third tap toggles back', () => {
    render(<Harness puzzle={basePuzzle()} />);
    fireEvent.click(defByText('dual-h'));
    expect(document.activeElement).toBe(inputAt(2, 1));
    fireEvent.click(defByText('dual-h'));
    expect(document.activeElement).toBe(inputAt(3, 0));
    fireEvent.click(defByText('dual-h'));
    expect(document.activeElement).toBe(inputAt(2, 1));
  });

  it('tapping a dual-def cell after focusing an unrelated word starts at clue #1', () => {
    render(<Harness puzzle={basePuzzle()} />);
    fireEvent.click(defByText('across'));
    expect(document.activeElement).toBe(inputAt(0, 1));
    fireEvent.click(defByText('dual-h'));
    expect(document.activeElement).toBe(inputAt(2, 1));
  });

  it('selecting a fully-locked word outlines only that word, not other validated cells', () => {
    // Two fully-validated words: the across word (row 0) and the dual-h word (row 2).
    render(<Harness puzzle={basePuzzle()} validated={new Set(['0,1', '0,2', '0,3', '0,4', '2,1', '2,2', '2,3', '2,4'])} />);
    fireEvent.click(defByText('across'));
    for (const col of [1, 2, 3, 4]) {
      expect(keycapAt(0, col).getAttribute('data-selected')).toBe('true');
    }
    // A validated cell in a different (unselected) word stays solved but un-outlined —
    // discriminates against a regression that outlines every cell.
    expect(keycapAt(2, 1).getAttribute('data-cell-state')).toBe('solved');
    expect(keycapAt(2, 1).getAttribute('data-selected')).toBeNull();
  });
});

describe('handleDefinitionClick hook behaviour', () => {
  it('does nothing while a pan gesture is in progress', () => {
    const { result } = renderHook(() => useGridNavigation(basePuzzle(), { isPanning: () => true }));
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue).toBeNull();
  });

  it('focuses the def word when not panning', () => {
    const { result } = renderHook(() => useGridNavigation(basePuzzle()));
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue?.clue.text).toBe('across');
  });

  it('a pan gesture leaves the already-focused word unchanged', () => {
    let panning = false;
    const { result } = renderHook(() => useGridNavigation(basePuzzle(), { isPanning: () => panning }));
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue?.clue.text).toBe('across');
    panning = true;
    act(() => result.current.handleDefinitionClick({ row: 2, col: 0 } as Position));
    expect(result.current.currentClue?.clue.text).toBe('across');
  });
});
