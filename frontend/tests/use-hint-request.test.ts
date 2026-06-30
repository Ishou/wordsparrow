import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHintRequest } from '@/ui/components/grid/useHintRequest';
import { HintRequestError, type PuzzleSolver } from '@/application';

const PUZZLE_ID = 'puzzle-x';

const WORD = [
  { row: 3, column: 5, letter: 'P' },
  { row: 3, column: 6, letter: 'A' },
  { row: 3, column: 7, letter: 'S' },
];

function makeSolver(): PuzzleSolver {
  return {
    validate: vi.fn().mockRejectedValue(new Error('not used here')),
    requestHint: vi.fn(),
  };
}

describe('useHintRequest — whole-word reveal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the active direction and writes hintsRemaining + the revealed word', async () => {
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: WORD,
      hintsRemaining: 2,
    });
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(3, 5, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(solver.requestHint).toHaveBeenCalledWith(PUZZLE_ID, 3, 5, 'across');
    expect(result.current.hintsRemaining).toBe(2);
    expect(result.current.lastResult).toEqual({ cells: WORD });
    expect(result.current.exhausted).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it('fires onReveal with every revealed cell so the parent can write the whole word', async () => {
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: WORD,
      hintsRemaining: 2,
    });
    const onReveal = vi.fn();
    const { result } = renderHook(() =>
      useHintRequest(PUZZLE_ID, 3, solver, onReveal),
    );

    await act(async () => {
      result.current.request(3, 5, 'down');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onReveal).toHaveBeenCalledWith(WORD);
  });

  it('flips exhausted on HintRequestError(budget-exhausted)', async () => {
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HintRequestError('budget-exhausted', 0, 'Indices épuisés'),
    );
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(3, 5, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.exhausted).toBe(true);
    expect(result.current.hintsRemaining).toBe(0);
    expect(result.current.errorMessage).toBe('Indices épuisés');
  });

  it('surfaces the sign-in prompt on HintRequestError(auth-required)', async () => {
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HintRequestError('auth-required', null, 'Authentification requise'),
    );
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(3, 5, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.errorMessage).toBe(
      'Connecte-toi pour utiliser les indices',
    );
    expect(result.current.exhausted).toBe(false);
  });

  it('clears the auth-required errorMessage after the linger interval', async () => {
    vi.useFakeTimers();
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HintRequestError('auth-required', null, 'Authentification requise'),
    );
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(3, 5, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.errorMessage).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('treats invalid-coord as a silent no-op without surfacing an error', async () => {
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HintRequestError('invalid-coord', null, 'out of bounds'),
    );
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(99, 99, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.exhausted).toBe(false);
    expect(result.current.hintsRemaining).toBe(3);
  });

  it('clears lastResult after the linger interval', async () => {
    vi.useFakeTimers();
    const solver = makeSolver();
    (solver.requestHint as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [{ row: 0, column: 0, letter: 'A' }],
      hintsRemaining: 2,
    });
    const { result } = renderHook(() => useHintRequest(PUZZLE_ID, 3, solver));

    await act(async () => {
      result.current.request(0, 0, 'across');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.lastResult).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.lastResult).toBeNull();
  });
});
