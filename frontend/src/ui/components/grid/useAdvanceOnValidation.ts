import { useCallback, useEffect, useRef } from 'react';
import type { Position, Puzzle } from '@/domain';
import { posKey } from './playLayout';
import type { Clue, GridNavigation } from './useGridNavigation';

// Reads the live <input> for a letter cell — values live in the DOM (ADR-0002 §4), not React state.
export function inputAt(row: number, col: number): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
}

export interface UseAdvanceOnValidationOptions {
  readonly puzzle: Puzzle;
  readonly nav: GridNavigation;
  // Validated/locked cells keyed `row,col`; solo client-validates, coop gets server `wordLocked` — both feed here.
  readonly validatedPositions: ReadonlySet<string>;
  // The clue under the focused cell (`nav.currentClue`) — the word the firewall may advance past.
  readonly currentClue: Clue | null;
  // Whole grid solved: suppress advancing so the cursor never chases past the last word.
  readonly completed: boolean;
}

export interface AdvanceOnValidation {
  // Wire to PuzzleBoard's `onBeatComplete`: runs the advance queued for a freshly-celebrated word.
  readonly onBeatComplete: () => void;
  // Signal a Tab/cycle move (jump) before its validation lands, so the firewall steps to the next clue.
  readonly markJump: (dir: 1 | -1) => void;
}

// Shared focus-advance firewall: derives "just validated this tick" from a diff of `validatedPositions`, so solo (client validate) and coop (server `wordLocked`) share one advance-to-next-word path.
export function useAdvanceOnValidation({
  puzzle,
  nav,
  validatedPositions,
  currentClue,
  completed,
}: UseAdvanceOnValidationOptions): AdvanceOnValidation {
  const byPos = useRef(new Map<string, { kind: string }>());
  const builtForRef = useRef<Puzzle | null>(null);
  if (builtForRef.current !== puzzle) {
    const m = new Map<string, { kind: string }>();
    for (const c of puzzle.cells) m.set(posKey(c.position.row, c.position.col), { kind: c.kind });
    byPos.current = m;
    builtForRef.current = puzzle;
  }

  // Tab/cycle direction + jump flag so a validated-cell skip distinguishes arrow moves from Tab/cycle.
  const tabDirRef = useRef<1 | -1>(1);
  const jumpPendingRef = useRef(false);
  const cycleClueRef = useRef(nav.cycleClue);
  cycleClueRef.current = nav.cycleClue;
  const currentClueRef = useRef<Clue | null>(currentClue);
  currentClueRef.current = currentClue;
  // The board owns the solve beat; the firewall queues the advance here for the board to run on beat end.
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  // Previous validation set — its diff yields the cells that just validated this tick.
  const prevValidatedRef = useRef<ReadonlySet<string>>(validatedPositions);

  // Walks along vec skipping validated cells; adjacent crosses gaps, jump stops at word boundary.
  const findNextEditable = useCallback(
    (from: Position, vec: { dr: number; dc: number }, validated: ReadonlySet<string>, adjacent: boolean): Position | null => {
      if (vec.dr === 0 && vec.dc === 0) return null;
      let r = from.row + vec.dr;
      let c = from.col + vec.dc;
      while (r >= 0 && r < puzzle.height && c >= 0 && c < puzzle.width) {
        const cell = byPos.current.get(posKey(r, c));
        if (!cell || cell.kind !== 'letter') {
          if (!adjacent) break;
        } else if (!validated.has(posKey(r, c))) {
          return { row: r, col: c };
        }
        r += vec.dr;
        c += vec.dc;
      }
      return null;
    },
    [puzzle.height, puzzle.width],
  );

  // The board fired the beat for a freshly-solved word; now run the queued next-word advance.
  const onBeatComplete = useCallback(() => {
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    advance?.();
  }, []);

  const cursor = nav.localCursor;
  const fRow = cursor?.position.row ?? -1;
  const fCol = cursor?.position.col ?? -1;
  const fDir = cursor?.direction ?? 'across';
  // Lets the host signal a Tab/cycle move (jump) vs an arrow step before validation lands.
  const markJump = useCallback((dir: 1 | -1) => {
    tabDirRef.current = dir;
    jumpPendingRef.current = true;
  }, []);
  const prevFocusRef = useRef<Position | null>(null);
  useEffect(() => {
    const wasJump = jumpPendingRef.current;
    jumpPendingRef.current = false;
    const prevValidated = prevValidatedRef.current;
    prevValidatedRef.current = validatedPositions;
    const cur = fRow >= 0 ? { row: fRow, col: fCol } : null;
    const prev = prevFocusRef.current;
    prevFocusRef.current = cur;
    if (!cur || !validatedPositions.has(posKey(cur.row, cur.col))) return;
    const adjacent = !wasJump && !!prev && Math.abs(cur.row - prev.row) + Math.abs(cur.col - prev.col) === 1;
    const vec =
      adjacent && prev
        ? { dr: cur.row - prev.row, dc: cur.col - prev.col }
        : { dr: fDir === 'down' ? 1 : 0, dc: fDir === 'across' ? 1 : 0 };
    const target = findNextEditable(cur, vec, validatedPositions, adjacent);
    // Only advance if the WHOLE current word is solved; partial or wrong keeps focus.
    const wordKeys = (currentClueRef.current?.cells ?? []).map((c) => posKey(c.position.row, c.position.col));
    const fullySolved = wordKeys.length > 0 && wordKeys.every((k) => validatedPositions.has(k));
    if (target && (fullySolved || wordKeys.includes(posKey(target.row, target.col)))) {
      inputAt(target.row, target.col)?.focus();
    } else if (adjacent && prev) {
      inputAt(prev.row, prev.col)?.focus();
    } else if (!adjacent && !completed && fullySolved) {
      const advance = () => {
        jumpPendingRef.current = true;
        cycleClueRef.current(tabDirRef.current);
      };
      // Celebrate only when THIS word's cells just validated this tick, not when tabbing onto a solved clue.
      const celebrate = wordKeys.some((k) => !prevValidated.has(k) && validatedPositions.has(k));
      if (celebrate) {
        // The board runs the beat (halo + haptic) off the same diff, then calls onBeatComplete → this advance.
        pendingAdvanceRef.current = advance;
        return;
      }
      advance();
    }
  }, [fRow, fCol, fDir, validatedPositions, findNextEditable, completed]);

  return { onBeatComplete, markJump };
}
