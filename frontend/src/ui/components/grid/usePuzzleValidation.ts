import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeAnswerLetter,
  type LetterCell,
  type Position,
  type Puzzle,
} from '@/domain';
import type { FilledCellInput, PuzzleSolver } from '@/application';

// Whole-grid binary validation for solo (ADR-0076 §§7–9): checks only once every cell is filled, reads `solved` only, never marks individual cells.

const positionKey = (row: number, col: number): string => `${row},${col}`;

export const GRID_NOT_SOLVED_MESSAGE =
  "Pas encore — ta grille n'est pas tout à fait juste";

export interface PuzzleValidationState {
  readonly validated: ReadonlySet<string>;
  readonly failMessage: string | null;
  readonly pending: boolean;
  // Call after any cell write or hint reveal; checks the full-grid transition.
  readonly onGridChanged: () => void;
}

export function usePuzzleValidation(
  puzzle: Puzzle,
  solver: PuzzleSolver,
  // Fired once when the grid validates, with every letter position, so the route can lock + persist them.
  onSolved?: (positions: ReadonlyArray<Position>) => void,
): PuzzleValidationState {
  const [validated, setValidated] = useState<ReadonlySet<string>>(() => new Set());
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const letterCells = useMemo<readonly LetterCell[]>(
    () => puzzle.cells.filter((c): c is LetterCell => c.kind === 'letter'),
    [puzzle.cells],
  );

  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  // Bumped per POST and per puzzle swap so a stale verdict can't resurrect a cleared pill.
  const requestSeqRef = useRef(0);
  // Dedupes identical full-grid submissions so refilling the same letters doesn't re-POST.
  const lastSubmittedRef = useRef<string | null>(null);

  useEffect(() => {
    setValidated(new Set());
    setFailMessage(null);
    setPending(false);
    lastSubmittedRef.current = null;
    requestSeqRef.current += 1;
  }, [puzzle]);

  const onGridChanged = useCallback(() => {
    const filled: FilledCellInput[] = [];
    for (const cell of letterCells) {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-cell-kind="letter"][data-row="${cell.position.row}"][data-col="${cell.position.col}"]`,
      );
      const normalized = normalizeAnswerLetter(input?.value ?? '');
      if (!normalized) continue;
      filled.push({ row: cell.position.row, column: cell.position.col, letter: normalized });
    }

    if (letterCells.length === 0 || filled.length !== letterCells.length) {
      // Editing again: invalidate any in-flight verdict and drop the transient pill.
      requestSeqRef.current += 1;
      lastSubmittedRef.current = null;
      setPending(false);
      setFailMessage(null);
      return;
    }

    const submittedKey = filled.map((c) => `${c.row},${c.column},${c.letter}`).join('|');
    if (submittedKey === lastSubmittedRef.current) return;
    lastSubmittedRef.current = submittedKey;

    const seq = ++requestSeqRef.current;
    setPending(true);
    void solver
      .validate(puzzle.id, filled)
      .then((result) => {
        if (seq !== requestSeqRef.current) return;
        if (result.solved) {
          const next = new Set<string>();
          for (const cell of letterCells) {
            next.add(positionKey(cell.position.row, cell.position.col));
          }
          setValidated(next);
          setFailMessage(null);
          onSolvedRef.current?.(
            letterCells.map((c) => ({ row: c.position.row, col: c.position.col })),
          );
          return;
        }
        setFailMessage(GRID_NOT_SOLVED_MESSAGE);
      })
      .catch(() => {
        if (seq !== requestSeqRef.current) return;
        lastSubmittedRef.current = null;
      })
      .finally(() => {
        if (seq !== requestSeqRef.current) return;
        setPending(false);
      });
  }, [letterCells, puzzle.id, solver]);

  return { validated, failMessage, pending, onGridChanged };
}
