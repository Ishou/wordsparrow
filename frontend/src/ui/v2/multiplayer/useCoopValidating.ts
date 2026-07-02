import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAnswerLetter, type Puzzle } from '@/domain';
import { wordRange } from '@/ui/components/grid/wordRange';

// Pulse tracks local completions not yet server-locked; armed behind DELAY_MS, capped at MAX_MS.
const DELAY_MS = 200;
// Safety cap: an unresolved pulse silently clears here (ADR-0085: the shake is now server-driven, not timed).
const MAX_MS = 3500;
// Shake window for a server `wordRejected` verdict, then the cells clear.
const REJECT_MS = 600;

const posKey = (row: number, col: number): string => `${row},${col}`;

const withoutKeys = (
  prev: ReadonlySet<string>,
  keys: ReadonlyArray<string>,
): ReadonlySet<string> => {
  if (!keys.some((k) => prev.has(k))) return prev;
  const next = new Set(prev);
  for (const k of keys) next.delete(k);
  return next;
};

interface PendingWord {
  arm: number | undefined;
  max: number;
  readonly keys: ReadonlyArray<string>;
}

export interface CoopValidatingState {
  readonly validating: ReadonlySet<string>;
  readonly rejecting: ReadonlySet<string>;
  // Arms the pulse when the filled cell completes a word.
  readonly noteLocalFill: (row: number, col: number) => void;
  // Server `wordRejected` verdict: clear any pulse on these cells and shake them.
  readonly noteServerReject: (
    positions: ReadonlyArray<{ row: number; column: number }>,
  ) => void;
}

export function useCoopValidating(
  puzzle: Puzzle,
  validatedPositions: ReadonlySet<string>,
): CoopValidatingState {
  const [validating, setValidating] = useState<ReadonlySet<string>>(() => new Set());
  const [rejecting, setRejecting] = useState<ReadonlySet<string>>(() => new Set());
  const wordsRef = useRef(new Map<string, PendingWord>());
  const rejectTimersRef = useRef(new Set<number>());

  const stopWord = useCallback((wordKey: string) => {
    const entry = wordsRef.current.get(wordKey);
    if (!entry) return;
    if (entry.arm !== undefined) window.clearTimeout(entry.arm);
    window.clearTimeout(entry.max);
    wordsRef.current.delete(wordKey);
    setValidating((prev) => withoutKeys(prev, entry.keys));
  }, []);

  const shakeCells = useCallback((keys: ReadonlyArray<string>) => {
    if (keys.length === 0) return;
    setRejecting((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    const clear = window.setTimeout(() => {
      rejectTimersRef.current.delete(clear);
      setRejecting((prev) => withoutKeys(prev, keys));
    }, REJECT_MS);
    rejectTimersRef.current.add(clear);
  }, []);

  // Server verdict for a just-completed wrong word: drop any pulse on those cells, then shake them.
  const noteServerReject = useCallback(
    (positions: ReadonlyArray<{ row: number; column: number }>) => {
      const keys = positions.map((p) => posKey(p.row, p.column));
      if (keys.length === 0) return;
      const keySet = new Set(keys);
      for (const [wordKey, entry] of [...wordsRef.current]) {
        if (entry.keys.some((k) => keySet.has(k))) stopWord(wordKey);
      }
      shakeCells(keys);
    },
    [stopWord, shakeCells],
  );

  const noteLocalFill = useCallback(
    (row: number, col: number) => {
      for (const direction of ['across', 'down'] as const) {
        const range = wordRange(puzzle, { row, col }, direction);
        if (range.length < 2) continue;
        const keys = range.map((p) => posKey(p.row, p.col));
        const wordKey = keys.join('|');
        if (wordsRef.current.has(wordKey)) continue; // already pending
        if (keys.every((k) => validatedPositions.has(k))) continue; // already locked
        const allFilled = range.every((p) => {
          const input = document.querySelector<HTMLInputElement>(
            `input[data-cell-kind="letter"][data-row="${p.row}"][data-col="${p.col}"]`,
          );
          return !!normalizeAnswerLetter(input?.value ?? '');
        });
        if (!allFilled) continue;
        const arm = window.setTimeout(() => {
          const entry = wordsRef.current.get(wordKey);
          if (entry) entry.arm = undefined;
          setValidating((prev) => {
            const next = new Set(prev);
            for (const k of keys) next.add(k);
            return next;
          });
        }, DELAY_MS);
        // Safety net only — clears the pulse if neither a lock nor a reject ever arrives (ADR-0085).
        const max = window.setTimeout(() => stopWord(wordKey), MAX_MS);
        wordsRef.current.set(wordKey, { arm, max, keys });
      }
    },
    [puzzle, validatedPositions, stopWord],
  );

  // Clear a pending word the moment the server locks all of its cells — never rejects.
  useEffect(() => {
    for (const [wordKey, entry] of [...wordsRef.current]) {
      if (entry.keys.every((k) => validatedPositions.has(k))) stopWord(wordKey);
    }
  }, [validatedPositions, stopWord]);

  // Strip a rejecting cell once it's locked, so a correct word never shows shake + solved together.
  useEffect(() => {
    setRejecting((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const k of prev) if (validatedPositions.has(k)) next.delete(k);
      return next.size === prev.size ? prev : next;
    });
  }, [validatedPositions]);

  useEffect(
    () => () => {
      for (const entry of wordsRef.current.values()) {
        if (entry.arm !== undefined) window.clearTimeout(entry.arm);
        window.clearTimeout(entry.max);
      }
      wordsRef.current.clear();
      for (const t of rejectTimersRef.current) window.clearTimeout(t);
      rejectTimersRef.current.clear();
    },
    [],
  );

  return { validating, rejecting, noteLocalFill, noteServerReject };
}
