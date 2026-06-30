import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  usePuzzleValidation,
  GRID_NOT_SOLVED_MESSAGE,
} from '@/ui/components/grid/usePuzzleValidation';
import type { Position, Puzzle } from '@/domain';
import type { PuzzleSolver, ValidationResult } from '@/application';

// Minimal puzzle: three letter cells in a row, one block. The hook reads
// cell values from the DOM via the `data-cell-kind` selector — we mount
// real `<input>` elements per test (ADR-0002 §4 uncontrolled inputs).
const puzzle: Puzzle = {
  id: 'test-puzzle',
  title: 't',
  language: 'fr',
  width: 4,
  height: 1,
  hintsAllowed: 3,
  hintsRemaining: 3,
  cells: [
    { kind: 'block', position: { row: 0, col: 0 } },
    { kind: 'letter', position: { row: 0, col: 1 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 2 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 3 }, entry: '' },
  ],
};

function mountInput(row: number, col: number, value: string) {
  const input = document.createElement('input');
  input.setAttribute('data-cell-kind', 'letter');
  input.setAttribute('data-row', String(row));
  input.setAttribute('data-col', String(col));
  input.value = value;
  document.body.appendChild(input);
  return input;
}

function makeSolver(result: ValidationResult): PuzzleSolver {
  return {
    validate: vi.fn().mockResolvedValue(result),
    requestHint: vi.fn().mockRejectedValue(new Error('not used here')),
  };
}

describe('usePuzzleValidation — whole-grid binary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not validate while any cell is still empty (no per-word checks)', async () => {
    mountInput(0, 1, 'A');
    mountInput(0, 2, '');
    mountInput(0, 3, 'C');
    const solver = makeSolver({ solved: false });
    const { result } = renderHook(() => usePuzzleValidation(puzzle, solver));

    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
    });

    expect(solver.validate).not.toHaveBeenCalled();
    expect(result.current.failMessage).toBeNull();
  });

  it('fires exactly one validate call when the last cell is filled, sending only filled letters normalized', async () => {
    const a = mountInput(0, 1, 'é');
    mountInput(0, 2, 'B');
    const last = mountInput(0, 3, '');
    const solver = makeSolver({ solved: false });
    const { result } = renderHook(() => usePuzzleValidation(puzzle, solver));

    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
    });
    expect(solver.validate).not.toHaveBeenCalled();

    last.value = 'C';
    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(solver.validate).toHaveBeenCalledTimes(1);
    expect(solver.validate).toHaveBeenCalledWith('test-puzzle', [
      { row: 0, column: 1, letter: 'E' },
      { row: 0, column: 2, letter: 'B' },
      { row: 0, column: 3, letter: 'C' },
    ]);
    void a;
  });

  it('marks every letter cell validated and reports the positions via onSolved when solved', async () => {
    mountInput(0, 1, 'A');
    mountInput(0, 2, 'B');
    mountInput(0, 3, 'C');
    const solver = makeSolver({ solved: true });
    const onSolved = vi.fn<(positions: ReadonlyArray<Position>) => void>();
    const { result } = renderHook(() =>
      usePuzzleValidation(puzzle, solver, onSolved),
    );

    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.validated.size).toBe(3);
    expect(result.current.validated.has('0,1')).toBe(true);
    expect(result.current.validated.has('0,3')).toBe(true);
    expect(result.current.failMessage).toBeNull();
    expect(onSolved).toHaveBeenCalledWith([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
  });

  it('shows the binary "not yet" pill on solved:false and marks no specific cell wrong', async () => {
    mountInput(0, 1, 'A');
    mountInput(0, 2, 'X');
    mountInput(0, 3, 'C');
    const solver = makeSolver({ solved: false });
    const { result } = renderHook(() => usePuzzleValidation(puzzle, solver));

    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.failMessage).toBe(GRID_NOT_SOLVED_MESSAGE);
    expect(result.current.validated.size).toBe(0);
  });

  it('clears the transient pill when the player edits the grid back to incomplete', async () => {
    mountInput(0, 1, 'A');
    mountInput(0, 2, 'X');
    const last = mountInput(0, 3, 'C');
    const solver = makeSolver({ solved: false });
    const { result } = renderHook(() => usePuzzleValidation(puzzle, solver));

    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failMessage).toBe(GRID_NOT_SOLVED_MESSAGE);

    last.value = '';
    await act(async () => {
      result.current.onGridChanged();
      await Promise.resolve();
    });

    expect(result.current.failMessage).toBeNull();
  });
});
