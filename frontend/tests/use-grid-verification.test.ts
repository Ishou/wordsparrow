import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGridVerification } from '@/ui/components/grid/useGridVerification';
import { VerifyRequestError, type PuzzleSolver, type VerifyResult } from '@/application';
import type { Puzzle } from '@/domain';

// Minimal puzzle: three letter cells; the hook reads cell values from the DOM (ADR-0002 §4 uncontrolled inputs).
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

function makeSolver(): PuzzleSolver {
  return {
    validate: vi.fn().mockRejectedValue(new Error('not used here')),
    requestHint: vi.fn().mockRejectedValue(new Error('not used here')),
    verify: vi.fn(),
  };
}

describe('useGridVerification', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('collects filled, not-yet-locked cells and calls solver.verify, skipping empty and locked cells', async () => {
    mountInput(0, 1, 'A');
    mountInput(0, 2, ''); // empty — excluded
    mountInput(0, 3, 'C');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [{ row: 0, column: 1, correct: true }],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const onCorrect = vi.fn();
    const locked = new Set(['0,3']); // already locked — excluded even though filled
    const { result } = renderHook(() => useGridVerification(puzzle, solver, locked, onCorrect));

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(solver.verify).toHaveBeenCalledWith('test-puzzle', [{ row: 0, column: 1, letter: 'A' }]);
  });

  it('seeds the cooldown from puzzle.secondsUntilNextVerify and gates verify while cooling', async () => {
    mountInput(0, 1, 'A');
    const solver = makeSolver();
    const cooling: Puzzle = { ...puzzle, secondsUntilNextVerify: 1200 };
    const { result } = renderHook(() => useGridVerification(cooling, solver, new Set(), vi.fn()));

    // Synced from the first render (ADR-0099), not null/available.
    expect(result.current.secondsUntilNextVerify).toBe(1200);

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The active cooldown gates the call: the server is never hit.
    expect(solver.verify).not.toHaveBeenCalled();
  });

  it('locks correct:true cells via onCorrect and flags correct:false cells shaking', async () => {
    vi.useFakeTimers();
    mountInput(0, 1, 'A');
    mountInput(0, 2, 'X');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [
        { row: 0, column: 1, correct: true },
        { row: 0, column: 2, correct: false },
      ],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const onCorrect = vi.fn();
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), onCorrect),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onCorrect).toHaveBeenCalledWith([{ row: 0, column: 1 }]);
    // The wrong cell shakes at its position in the sweep — advance past its stagger delay.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.shakingPositions.has('0,2')).toBe(true);
    expect(result.current.shakingPositions.has('0,1')).toBe(false);
  });

  it('plays the verify sweep in reading order and flags the generic word cue to skip', async () => {
    vi.useFakeTimers();
    mountInput(0, 1, 'A');
    mountInput(0, 2, 'X');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [
        { row: 0, column: 2, correct: false },
        { row: 0, column: 1, correct: true },
      ],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const soundPlayer = {
      playWordValidated: vi.fn(),
      playVerifySweep: vi.fn(),
      playPuzzleSolved: vi.fn(),
    };
    const suppressWordCueRef = { current: false };
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn(), soundPlayer, suppressWordCueRef),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Sweep is reading-order (0,1 then 0,2), so verdicts are [correct, wrong].
    expect(soundPlayer.playVerifySweep).toHaveBeenCalledWith([true, false]);
    expect(soundPlayer.playWordValidated).not.toHaveBeenCalled();
    // A lock will fire, so the generic word cue is suppressed once.
    expect(suppressWordCueRef.current).toBe(true);
  });

  it('clears the shake after the shake window elapses', async () => {
    vi.useFakeTimers();
    mountInput(0, 1, 'X');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [{ row: 0, column: 1, correct: false }],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn()),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });
    // Staggered shake-add fires on its (zero) delay timer.
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current.shakingPositions.has('0,1')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.shakingPositions.size).toBe(0);
  });

  it('seeds the cooldown from secondsUntilNextVerify on success and blocks a repeat call while cooling', async () => {
    mountInput(0, 1, 'A');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [{ row: 0, column: 1, correct: true }],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn()),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.secondsUntilNextVerify).toBe(1800);

    act(() => {
      result.current.verify();
    });
    expect(solver.verify).toHaveBeenCalledTimes(1);
  });

  it('blocks a call while a previous one is pending', async () => {
    mountInput(0, 1, 'A');
    const solver = makeSolver();
    let resolveVerify: (r: VerifyResult) => void = () => {};
    (solver.verify as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<VerifyResult>((resolve) => {
        resolveVerify = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn()),
    );

    act(() => {
      result.current.verify();
    });
    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.verify();
    });
    expect(solver.verify).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify({ cells: [], secondsUntilNextVerify: 1800 });
      await Promise.resolve();
    });
  });

  it('does not call solver.verify when there is nothing filled and unlocked', () => {
    const solver = makeSolver();
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn()),
    );

    act(() => {
      result.current.verify();
    });
    expect(solver.verify).not.toHaveBeenCalled();
  });

  it('on 429 (cooldown-active): shows the cooldown pill, seeds the ticker, and makes no grid change', async () => {
    mountInput(0, 1, 'A');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockRejectedValue(
      new VerifyRequestError('cooldown-active', 900, 'Verification cooldown active'),
    );
    const onCorrect = vi.fn();
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), onCorrect),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.errorMessage).toBe('Vérification en cooldown');
    expect(result.current.secondsUntilNextVerify).toBe(900);
    expect(onCorrect).not.toHaveBeenCalled();
    expect(result.current.shakingPositions.size).toBe(0);
  });

  it('surfaces the sign-in prompt on VerifyRequestError(auth-required)', async () => {
    mountInput(0, 1, 'A');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockRejectedValue(
      new VerifyRequestError('auth-required', null, 'Authentification requise'),
    );
    const { result } = renderHook(() =>
      useGridVerification(puzzle, solver, new Set(), vi.fn()),
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.errorMessage).toBe('Connecte-toi pour vérifier ta grille');
  });

  it('resets pending/cooldown/shake/error on puzzle change', async () => {
    vi.useFakeTimers();
    mountInput(0, 1, 'X');
    const solver = makeSolver();
    (solver.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      cells: [{ row: 0, column: 1, correct: false }],
      secondsUntilNextVerify: 1800,
    } satisfies VerifyResult);
    const { result, rerender } = renderHook(
      ({ p }: { p: Puzzle }) => useGridVerification(p, solver, new Set(), vi.fn()),
      { initialProps: { p: puzzle } },
    );

    await act(async () => {
      result.current.verify();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current.secondsUntilNextVerify).toBe(1800);
    expect(result.current.shakingPositions.size).toBe(1);

    rerender({ p: { ...puzzle, id: 'other-puzzle' } });

    expect(result.current.secondsUntilNextVerify).toBeNull();
    expect(result.current.shakingPositions.size).toBe(0);
    expect(result.current.pending).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });
});
