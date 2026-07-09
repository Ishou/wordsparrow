import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAnswerLetter, type Puzzle } from '@/domain';
import { VerifyRequestError, type PuzzleSolver } from '@/application';
import { t } from '@/ui/i18n';
import { useCountdownTicker } from './useCountdownTicker';

// Shake window for a wrong verify verdict; mirrors useCoopValidating's REJECT_MS for the same visual language.
const SHAKE_MS = 600;

const posKey = (row: number, col: number): string => `${row},${col}`;

export interface GridVerificationState {
  readonly pending: boolean;
  /** Live seconds until the next allowed call; `null` before any call has seeded a cooldown this session. */
  readonly secondsUntilNextVerify: number | null;
  readonly shakingPositions: ReadonlySet<string>;
  readonly errorMessage: string | null;
  // Gathers filled, not-yet-locked cells from the DOM and submits them; no-ops while pending/cooling or with nothing to check.
  readonly verify: () => void;
}

export function useGridVerification(
  puzzle: Puzzle,
  solver: PuzzleSolver,
  // Cells to exclude from submission — already locked via an earlier correct verify, hint, or auto-validation.
  lockedPositions: ReadonlySet<string>,
  // Fired with every cell verified correct so the route can lock + persist them via the existing hint/co-op path.
  onCorrect: (positions: ReadonlyArray<{ row: number; column: number }>) => void,
): GridVerificationState {
  const [pending, setPending] = useState(false);
  const [serverSeconds, setServerSeconds] = useState<number | null>(null);
  const [shakingPositions, setShakingPositions] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Display-only ticker; the server stays source of truth for the cooldown gate itself.
  const secondsUntilNextVerify = useCountdownTicker(serverSeconds);
  const liveSecondsRef = useRef(secondsUntilNextVerify);
  liveSecondsRef.current = secondsUntilNextVerify;

  const lockedRef = useRef(lockedPositions);
  lockedRef.current = lockedPositions;
  const onCorrectRef = useRef(onCorrect);
  useEffect(() => {
    onCorrectRef.current = onCorrect;
  }, [onCorrect]);

  const requestSeqRef = useRef(0);
  const shakeTimerRef = useRef<number | null>(null);

  const clearShakeTimer = useCallback(() => {
    if (shakeTimerRef.current !== null) {
      window.clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
  }, []);

  // Reset on puzzle change.
  useEffect(() => {
    setPending(false);
    setServerSeconds(null);
    setShakingPositions(new Set());
    setErrorMessage(null);
    requestSeqRef.current += 1;
    clearShakeTimer();
  }, [puzzle.id, clearShakeTimer]);

  useEffect(() => () => clearShakeTimer(), [clearShakeTimer]);

  // Strip a shaking cell the moment it locks via a separate path (e.g. a fresh word completed while the shake lingers).
  useEffect(() => {
    setShakingPositions((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const k of prev) {
        if (lockedPositions.has(k)) {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [lockedPositions]);

  const verify = useCallback(() => {
    if (pending || (liveSecondsRef.current ?? 0) > 0) return;

    const cells: { row: number; column: number; letter: string }[] = [];
    for (const cell of puzzle.cells) {
      if (cell.kind !== 'letter') continue;
      const key = posKey(cell.position.row, cell.position.col);
      if (lockedRef.current.has(key)) continue;
      const input = document.querySelector<HTMLInputElement>(
        `input[data-cell-kind="letter"][data-row="${cell.position.row}"][data-col="${cell.position.col}"]`,
      );
      const normalized = normalizeAnswerLetter(input?.value ?? '');
      if (!normalized) continue;
      cells.push({ row: cell.position.row, column: cell.position.col, letter: normalized });
    }
    if (cells.length === 0) return;

    const seq = ++requestSeqRef.current;
    setPending(true);
    setErrorMessage(null);
    void solver
      .verify(puzzle.id, cells)
      .then((result) => {
        if (seq !== requestSeqRef.current) return;
        setServerSeconds(result.secondsUntilNextVerify);
        const correct: { row: number; column: number }[] = [];
        const wrongKeys: string[] = [];
        for (const verdict of result.cells) {
          if (verdict.correct) correct.push({ row: verdict.row, column: verdict.column });
          else wrongKeys.push(posKey(verdict.row, verdict.column));
        }
        if (correct.length > 0) onCorrectRef.current(correct);
        if (wrongKeys.length > 0) {
          setShakingPositions(new Set(wrongKeys));
          clearShakeTimer();
          shakeTimerRef.current = window.setTimeout(() => {
            shakeTimerRef.current = null;
            setShakingPositions(new Set());
          }, SHAKE_MS);
        }
      })
      .catch((err: unknown) => {
        if (seq !== requestSeqRef.current) return;
        if (err instanceof VerifyRequestError) {
          if (err.kind === 'cooldown-active') {
            setServerSeconds(err.secondsUntilNextVerify ?? 0);
            setErrorMessage(t('grid.verify.error.cooldown'));
          } else if (err.kind === 'auth-required') {
            setErrorMessage(t('grid.verify.error.authRequired'));
          } else {
            setErrorMessage(t('grid.verify.error.generic'));
          }
        } else {
          setErrorMessage(t('grid.verify.error.generic'));
        }
      })
      .finally(() => {
        if (seq !== requestSeqRef.current) return;
        setPending(false);
      });
  }, [pending, puzzle, solver, clearShakeTimer]);

  return { pending, secondsUntilNextVerify, shakingPositions, errorMessage, verify };
}
