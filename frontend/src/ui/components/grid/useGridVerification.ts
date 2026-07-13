import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAnswerLetter, type Puzzle } from '@/domain';
import { VerifyRequestError, type PuzzleSolver } from '@/application';
import type { SoundPlayer } from '@/application/session/SoundPlayer';
import { solvePulseCellDelaysMs } from '@/application/grid/solvePulse';
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
  soundPlayer?: SoundPlayer,
  // Verify plays its own woven sweep; this one-shot flag tells useGridSounds to skip the generic cue for the lock it triggers.
  suppressWordCueRef?: { current: boolean },
): GridVerificationState {
  const [pending, setPending] = useState(false);
  // Seed from the server-authoritative cooldown on the puzzle so a reload shows the countdown synced from the first paint (ADR-0099), not "available until the first click".
  const [serverSeconds, setServerSeconds] = useState<number | null>(
    () => puzzle.secondsUntilNextVerify ?? null,
  );
  const [shakingPositions, setShakingPositions] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Display-only ticker; the server stays source of truth for the cooldown gate itself.
  const secondsUntilNextVerify = useCountdownTicker(serverSeconds);
  const liveSecondsRef = useRef(secondsUntilNextVerify);
  liveSecondsRef.current = secondsUntilNextVerify;

  const lockedRef = useRef(lockedPositions);
  lockedRef.current = lockedPositions;
  const onCorrectRef = useRef(onCorrect);
  const soundPlayerRef = useRef(soundPlayer);
  useEffect(() => {
    onCorrectRef.current = onCorrect;
    soundPlayerRef.current = soundPlayer;
  }, [onCorrect, soundPlayer]);

  const requestSeqRef = useRef(0);
  const shakeTimersRef = useRef<number[]>([]);

  const clearShakeTimers = useCallback(() => {
    for (const id of shakeTimersRef.current) window.clearTimeout(id);
    shakeTimersRef.current = [];
  }, []);

  // Reset on puzzle change; re-seed from the new puzzle's server cooldown.
  useEffect(() => {
    setPending(false);
    setServerSeconds(puzzle.secondsUntilNextVerify ?? null);
    setShakingPositions(new Set());
    setErrorMessage(null);
    requestSeqRef.current += 1;
    clearShakeTimers();
  }, [puzzle.id, puzzle.secondsUntilNextVerify, clearShakeTimers]);

  useEffect(() => () => clearShakeTimers(), [clearShakeTimers]);

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

        // Reading-order sweep: correct → rising tick + drop, wrong → thud + shake, each at its position.
        const ordered = [...result.cells].sort((a, b) => a.row - b.row || a.column - b.column);
        const verdicts = ordered.map((c) => c.correct);
        const correct = ordered.filter((c) => c.correct).map((c) => ({ row: c.row, column: c.column }));

        if (soundPlayerRef.current && verdicts.length > 0) {
          // Only suppress the generic cue when a lock will fire it (there is at least one correct cell).
          if (suppressWordCueRef && correct.length > 0) suppressWordCueRef.current = true;
          soundPlayerRef.current.playVerifySweep(verdicts);
        }

        if (correct.length > 0) onCorrectRef.current(correct);

        // Stagger each wrong cell's shake to where it sits in the sweep, matching the audio thuds.
        clearShakeTimers();
        const delays = solvePulseCellDelaysMs(ordered.length);
        let maxDelay = 0;
        let anyWrong = false;
        ordered.forEach((c, i) => {
          if (c.correct) return;
          anyWrong = true;
          const key = posKey(c.row, c.column);
          maxDelay = Math.max(maxDelay, delays[i]);
          shakeTimersRef.current.push(
            window.setTimeout(() => {
              setShakingPositions((prev) => {
                const next = new Set(prev);
                next.add(key);
                return next;
              });
            }, delays[i]),
          );
        });
        if (anyWrong) {
          shakeTimersRef.current.push(
            window.setTimeout(() => setShakingPositions(new Set()), maxDelay + SHAKE_MS),
          );
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
  }, [pending, puzzle, solver, clearShakeTimers, suppressWordCueRef]);

  return { pending, secondsUntilNextVerify, shakingPositions, errorMessage, verify };
}
