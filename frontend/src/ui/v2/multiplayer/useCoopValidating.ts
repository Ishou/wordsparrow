import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAnswerLetter, type Puzzle } from '@/domain';
import { wordRange } from '@/ui/components/grid/wordRange';

// Coop has no client-side validate call: the local player fills cells, the
// server validates, and a correct word comes back as `wordLocked`. This hook
// shows the same discreet "checking…" pulse as solo/minigame by tracking words
// the local player just completed but the server hasn't locked yet.
//
//  - DELAY_MS: arm the pulse only after the lock has been this slow, so the
//    common fast case never flashes it.
//  - MAX_MS: a wrong word is never locked, so stop pulsing after this window
//    rather than spinning forever.
const DELAY_MS = 200;
const MAX_MS = 3500;

const posKey = (row: number, col: number): string => `${row},${col}`;

interface PendingWord {
  arm: number | undefined;
  max: number;
  readonly keys: ReadonlyArray<string>;
}

export interface CoopValidatingState {
  readonly validating: ReadonlySet<string>;
  // Call after the local player writes a letter; checks whether that cell just
  // completed a word and, if so, arms the pulse for it.
  readonly noteLocalFill: (row: number, col: number) => void;
}

export function useCoopValidating(
  puzzle: Puzzle,
  validatedPositions: ReadonlySet<string>,
): CoopValidatingState {
  const [validating, setValidating] = useState<ReadonlySet<string>>(() => new Set());
  const wordsRef = useRef(new Map<string, PendingWord>());

  const stopWord = useCallback((wordKey: string) => {
    const entry = wordsRef.current.get(wordKey);
    if (!entry) return;
    if (entry.arm !== undefined) window.clearTimeout(entry.arm);
    window.clearTimeout(entry.max);
    wordsRef.current.delete(wordKey);
    setValidating((prev) => {
      if (!entry.keys.some((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of entry.keys) next.delete(k);
      return next;
    });
  }, []);

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
        const max = window.setTimeout(() => stopWord(wordKey), MAX_MS);
        wordsRef.current.set(wordKey, { arm, max, keys });
      }
    },
    [puzzle, validatedPositions, stopWord],
  );

  // Clear a pending word the moment the server locks all of its cells.
  useEffect(() => {
    for (const [wordKey, entry] of [...wordsRef.current]) {
      if (entry.keys.every((k) => validatedPositions.has(k))) stopWord(wordKey);
    }
  }, [validatedPositions, stopWord]);

  useEffect(
    () => () => {
      for (const entry of wordsRef.current.values()) {
        if (entry.arm !== undefined) window.clearTimeout(entry.arm);
        window.clearTimeout(entry.max);
      }
      wordsRef.current.clear();
    },
    [],
  );

  return { validating, noteLocalFill };
}
