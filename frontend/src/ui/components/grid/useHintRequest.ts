import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HintRequestError,
  type HintDirection,
  type PuzzleSolver,
  type RevealedWordCell,
} from '@/application';

// Seeds from `Puzzle.hintsRemaining`; server overwrites on each POST; 429 flips exhausted; resets on puzzle change.

const RESULT_LINGER_MS = 4_000;

// A successful reveal returns the whole focused word (ADR-0076 §§7–9).
export interface HintLastResult {
  readonly cells: ReadonlyArray<RevealedWordCell>;
}

export interface HintRequestState {
  readonly hintsRemaining: number;
  readonly exhausted: boolean;
  readonly pending: boolean;
  readonly lastResult: HintLastResult | null;
  readonly errorMessage: string | null;
  readonly request: (row: number, column: number, direction: HintDirection) => void;
}

export function useHintRequest(
  puzzleId: string,
  initialHintsRemaining: number,
  solver: PuzzleSolver,
  onReveal?: (cells: ReadonlyArray<RevealedWordCell>) => void,
  // Fired when a hint succeeds so the route can persist the running
  // tally via `soloEntriesStore.recordHintUsed`.
  onHintConsumed?: () => void,
): HintRequestState {
  const seed = Math.max(0, initialHintsRemaining);
  const [hintsRemaining, setHintsRemaining] = useState<number>(seed);
  const [exhausted, setExhausted] = useState<boolean>(seed <= 0);
  const [pending, setPending] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<HintLastResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lingerTimerRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);
  const onHintConsumedRef = useRef(onHintConsumed);
  useEffect(() => {
    onHintConsumedRef.current = onHintConsumed;
  }, [onHintConsumed]);

  // Reset on puzzle change or loader-triggered `initialHintsRemaining` change.
  useEffect(() => {
    const remaining = Math.max(0, initialHintsRemaining);
    setHintsRemaining(remaining);
    setExhausted(remaining <= 0);
    setPending(false);
    setLastResult(null);
    setErrorMessage(null);
    requestSeqRef.current += 1;
    if (lingerTimerRef.current !== null) {
      window.clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = null;
    }
  }, [puzzleId, initialHintsRemaining]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (lingerTimerRef.current !== null) {
        window.clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    };
  }, []);

  const scheduleLinger = useCallback(() => {
    if (lingerTimerRef.current !== null) {
      window.clearTimeout(lingerTimerRef.current);
    }
    lingerTimerRef.current = window.setTimeout(() => {
      lingerTimerRef.current = null;
      setLastResult(null);
      setErrorMessage(null);
    }, RESULT_LINGER_MS);
  }, []);

  const request = useCallback(
    (row: number, column: number, direction: HintDirection) => {
      if (pending || exhausted) return;
      const seq = ++requestSeqRef.current;
      setPending(true);
      setErrorMessage(null);
      void solver
        .requestHint(puzzleId, row, column, direction)
        .then((result) => {
          if (seq !== requestSeqRef.current) return;
          setHintsRemaining(result.hintsRemaining);
          setLastResult({ cells: result.cells });
          if (result.hintsRemaining <= 0) setExhausted(true);
          onHintConsumedRef.current?.();
          onRevealRef.current?.(result.cells);
          scheduleLinger();
        })
        .catch((err: unknown) => {
          if (seq !== requestSeqRef.current) return;
          if (err instanceof HintRequestError) {
            if (err.kind === 'budget-exhausted') {
              setExhausted(true);
              setHintsRemaining(0);
              setErrorMessage('Indices épuisés');
            } else if (err.kind === 'invalid-coord') {
              // Stale-focus race; silent no-op for the user, the linger
              // tick still fires so an in-flight pill clears.
              scheduleLinger();
              return;
            } else if (err.kind === 'auth-required') {
              setErrorMessage('Connecte-toi pour utiliser les indices');
            } else {
              setErrorMessage('Erreur, réessayez');
            }
          } else {
            setErrorMessage('Erreur, réessayez');
          }
          scheduleLinger();
        })
        .finally(() => {
          if (seq !== requestSeqRef.current) return;
          setPending(false);
        });
    },
    [exhausted, pending, puzzleId, scheduleLinger, solver],
  );

  return {
    hintsRemaining,
    exhausted,
    pending,
    lastResult,
    errorMessage,
    request,
  };
}
