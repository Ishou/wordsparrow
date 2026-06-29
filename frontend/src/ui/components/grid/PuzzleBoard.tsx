import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { css, cx } from 'styled-system/css';
import type { Cell as DomainCell, Position, Puzzle } from '@/domain';
import { Cell, DefCell, type CellState } from '@/design-system';
import { type CellHighlight, type GridNavigation } from './useGridNavigation';
import { GRID_INPUT_GUARDS } from './gridInputGuards';
import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';
import { CELL, GAP, STRIDE, posKey, exitsRight } from './playLayout';
import { PanZoom, type PanZoomHandle } from '@/ui/play/PanZoom';

const boardWrap = css({ position: 'relative', width: 'max-content' });
const boardGrid = css({ display: 'grid', position: 'relative', zIndex: 1 });
const spacer = css({ borderRadius: '9px' });

// Keycap (state visuals) + transparent uncontrolled input on top; cell values in the DOM (ADR-0002 §4).
const cellWrap = css({ position: 'relative', cursor: 'pointer' });
// Sakura halo bloomed around a freshly-solved word's cells during the solve beat.
const cellGlow = css({ borderRadius: '13px', zIndex: 1, animation: 'wsSolveGlow 0.45s ease-out both' });
// Discreet "checking with the server" ring on a completed word awaiting its verdict; outline (not box-shadow) so it never clobbers the cell's state ring.
const cellValidating = css({ borderRadius: '9px', outline: '2px solid', outlineOffset: '-2px', animation: 'wsValidating 1.1s ease-in-out infinite' });
// Quick rotational wobble on a completed-but-wrong word's cells ("not quite").
const cellShake = css({ zIndex: 1, animation: 'wsShake 0.4s ease-in-out both' });
const letterInput = css({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'center',
  fontFamily: 'wsMono',
  fontWeight: 'semibold',
  fontSize: '1.5em',
  color: 'ws.khaki',
  caretColor: 'transparent',
  borderRadius: '9px',
  cursor: 'pointer',
  '&::-webkit-search-cancel-button, &::-webkit-search-decoration': { WebkitAppearance: 'none', display: 'none' },
  '&:read-only': { cursor: 'default' },
});
const letterInputOnActive = css({ color: 'white' });

// One letter slot: keycap (state visuals) + transparent input (live value).
function LetterSlot({
  row,
  col,
  entry,
  validated,
  validating,
  touchPrimary,
  highlight,
  nav,
  onKeyDown,
  solveDelay,
  celebrateDelay,
  rejectShake,
}: {
  readonly row: number;
  readonly col: number;
  readonly entry: string;
  readonly validated: boolean;
  // A completed word whose server validation is slow to respond — discreet jade ring until the verdict lands (gated upstream).
  readonly validating?: boolean;
  // On touch the cell is read-only so no editing caret/selection appears; letters arrive from the on-screen keyboard.
  readonly touchPrimary: boolean;
  readonly highlight: CellHighlight;
  readonly nav: GridNavigation;
  readonly onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  // ms stagger for the flatten ripple when this cell just validated; omit for a static solved tile.
  readonly solveDelay?: number;
  // ms stagger for the sakura solve-beat halo; omit when not celebrating.
  readonly celebrateDelay?: number;
  // true while this cell's word wobbles after a wrong completion.
  readonly rejectShake?: boolean;
}) {
  const state: CellState = validated
    ? 'solved'
    : highlight.focused
      ? 'active'
      : highlight.currentWord
        ? 'activeWord'
        : 'empty';
  return (
    // mousedown-preventDefault keeps pan-start on a cell from stealing focus.
    <div
      className={cx(cellWrap, celebrateDelay !== undefined && cellGlow, rejectShake && cellShake, validating && !validated && cellValidating)}
      style={celebrateDelay !== undefined ? { animationDelay: `${celebrateDelay}ms` } : undefined}
      data-row={row}
      data-col={col}
      data-validating={validating && !validated ? 'true' : undefined}
      onClick={nav.handleClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Cell state={state} solveDelay={solveDelay} />
      <input
        ref={nav.registerCellRef}
        {...GRID_INPUT_GUARDS}
        aria-label={`Ligne ${row + 1}, colonne ${col + 1}`}
        defaultValue={entry}
        readOnly={validated || touchPrimary}
        aria-readonly={validated || undefined}
        tabIndex={validated ? -1 : undefined}
        className={cx(letterInput, state === 'active' && letterInputOnActive)}
        data-row={row}
        data-col={col}
        data-cell-kind="letter"
        onKeyDown={onKeyDown}
        onFocus={nav.handleFocus}
        onBlur={nav.handleBlur}
        onInput={nav.handleInput}
      />
    </div>
  );
}

export interface PuzzleBoardHandle {
  // PanZoom imperative handle — auto-frame / per-cell reveal / zoom controls. A getter so it reads the live ref (null only before mount).
  readonly panZoom: PanZoomHandle | null;
  // Pans so a single cell becomes visible (used by the screen on focus change).
  readonly revealCell: (p: Position) => void;
  // Aborts an in-flight solve beat — a user tap / rail step during the beat skips it.
  readonly cancelBeat: () => void;
}

export interface PuzzleBoardProps {
  readonly puzzle: Puzzle;
  // The screen's grid navigation — owned by the screen so its rail/clue panel re-render on focus.
  readonly nav: GridNavigation;
  // Solved/locked cells, keyed `row,col`. A new key in this set fires the solve beat.
  readonly validatedPositions: ReadonlySet<string>;
  // "row,col" keys of a completed word whose server validation is in flight
  // (delay-gated upstream). Renders the discreet jade pulse until the verdict
  // lands — solo derives it from the auto-validation hook, coop from locally
  // completed words not yet server-locked.
  readonly validatingPositions?: ReadonlySet<string>;
  // Seed letters for the uncontrolled inputs, keyed `row,col`.
  readonly entryAt: ReadonlyMap<string, string>;
  // Definition cells whose every clue word is fully solved → lit "done" surface (solo only).
  readonly solvedDefCells?: ReadonlySet<string>;
  // Cells of a completed-but-wrong word currently wobbling (solo only).
  readonly rejectingPositions?: ReadonlySet<string>;
  // Forwarded to PanZoom's viewport element — the screen owns sizing + background.
  readonly className?: string;
  // PanZoom pan-inset overrides.
  readonly padTop?: number;
  readonly padBottom?: number;
  readonly padX?: number;
  readonly maxScale?: number;
  readonly edgeFade?: boolean;
  // Per-cell keydown handler (solo wires its always-move backspace + tab tracking here).
  readonly onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  // Guards against celebrating async-restored cells on mount (solo resume); omit to always celebrate.
  readonly celebrateGuard?: () => boolean;
  // Called after the solve-beat halo completes; solo uses it to advance to the next word.
  readonly onBeatComplete?: (positions: ReadonlyArray<Position>) => void;
  // Overlay rendered over the board grid inside the same pan/zoom stage (coop presence).
  readonly overlay?: ReactNode;
}

export const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(function PuzzleBoard(
  {
    puzzle,
    nav,
    validatedPositions,
    validatingPositions,
    entryAt,
    solvedDefCells,
    rejectingPositions,
    className,
    padTop,
    padBottom,
    padX,
    maxScale = 2.6,
    edgeFade,
    onKeyDown,
    celebrateGuard,
    onBeatComplete,
    overlay,
  },
  ref,
) {
  const pzRef = useRef<PanZoomHandle>(null);
  const touchPrimary = useTouchPrimary();

  const BOARD_W = puzzle.width * CELL + (puzzle.width - 1) * GAP;
  const BOARD_H = puzzle.height * CELL + (puzzle.height - 1) * GAP;

  const byPos = useMemo(() => {
    const m = new Map<string, DomainCell>();
    for (const c of puzzle.cells) m.set(posKey(c.position.row, c.position.col), c);
    return m;
  }, [puzzle]);

  const revealCell = useCallback((p: Position) => {
    pzRef.current?.reveal(p.col * STRIDE, p.row * STRIDE, CELL, CELL);
  }, []);

  // Solve beat: sakura halo + flatten ripple + haptic when cells newly validate; interruptible; reduced-motion skips the visuals.
  const [celebrating, setCelebrating] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [solveDelays, setSolveDelays] = useState<ReadonlyMap<string, number>>(() => new Map());
  const solveBeatRef = useRef<number | null>(null);
  const rippleTimerRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);
  // Seeds prev with the hydration set so an in-progress board (coop rejoin / solo resume) never celebrates already-solved cells.
  const prevValidatedRef = useRef<ReadonlySet<string>>(validatedPositions);
  const onBeatCompleteRef = useRef(onBeatComplete);
  onBeatCompleteRef.current = onBeatComplete;
  const celebrateGuardRef = useRef(celebrateGuard);
  celebrateGuardRef.current = celebrateGuard;

  const cancelBeat = useCallback(() => {
    if (solveBeatRef.current === null) return;
    window.clearTimeout(solveBeatRef.current);
    solveBeatRef.current = null;
    setCelebrating(new Map());
  }, []);

  useEffect(() => () => {
    if (solveBeatRef.current) window.clearTimeout(solveBeatRef.current);
    if (rippleTimerRef.current) window.clearTimeout(rippleTimerRef.current);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotionRef.current = mq.matches;
    const onChange = () => { reduceMotionRef.current = mq.matches; };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Universal solve beat: diff the validation set so newly-solved cells celebrate on any path (local solve, hint, or remote wordLocked).
  useEffect(() => {
    const prev = prevValidatedRef.current;
    prevValidatedRef.current = validatedPositions;
    const added = [...validatedPositions].filter((k) => !prev.has(k));
    if (added.length === 0) return;
    // Hydration restore (solo resume / pre-user-action): absorb the cells silently, no beat.
    if (celebrateGuardRef.current?.() === false) return;
    added.sort((a, b) => {
      const [ar, ac] = a.split(',').map(Number);
      const [br, bc] = b.split(',').map(Number);
      return ar - br || ac - bc;
    });
    const addedPositions = added.map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(14);
    // Flatten ripple: stagger the keycap drop across the newly-solved cells, then clear.
    const ripple = new Map<string, number>();
    added.forEach((k, i) => ripple.set(k, i * 45));
    setSolveDelays(ripple);
    if (rippleTimerRef.current) window.clearTimeout(rippleTimerRef.current);
    rippleTimerRef.current = window.setTimeout(() => setSolveDelays(new Map()), (added.length - 1) * 45 + 340);
    if (reduceMotionRef.current) {
      // Microtask defer so the parent's solve-firewall effect (which queues the advance) runs first.
      queueMicrotask(() => onBeatCompleteRef.current?.(addedPositions));
      return;
    }
    setCelebrating(new Map(ripple));
    let last = 0;
    for (const d of ripple.values()) last = Math.max(last, d);
    if (solveBeatRef.current) window.clearTimeout(solveBeatRef.current);
    solveBeatRef.current = window.setTimeout(() => {
      solveBeatRef.current = null;
      setCelebrating(new Map());
      onBeatCompleteRef.current?.(addedPositions);
    }, last + 480);
  }, [validatedPositions]);

  useImperativeHandle(
    ref,
    () => ({ get panZoom() { return pzRef.current; }, revealCell, cancelBeat }),
    [revealCell, cancelBeat],
  );

  return (
    <PanZoom
      ref={pzRef}
      className={className}
      contentWidth={BOARD_W}
      contentHeight={BOARD_H}
      fit="contain"
      padTop={padTop}
      padBottom={padBottom}
      padX={padX}
      maxScale={maxScale}
      edgeFade={edgeFade}
    >
      <div className={boardWrap}>
        <div className={boardGrid} style={{ gridTemplateColumns: `repeat(${puzzle.width}, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: `${GAP}px` }}>
          {Array.from({ length: puzzle.height * puzzle.width }, (_, i) => {
            const row = Math.floor(i / puzzle.width);
            const col = i % puzzle.width;
            const cell = byPos.get(posKey(row, col));
            if (cell?.kind === 'definition') {
              const sorted = [...cell.clues].sort((x, y) => Number(!exitsRight(x.arrow)) - Number(!exitsRight(y.arrow)));
              const active = nav.highlightFor({ row, col }).currentArrow !== null;
              return (
                <DefCell
                  key={i}
                  clues={sorted.map((c) => c.text)}
                  arrows={sorted.map((c) => c.arrow)}
                  active={active}
                  validated={solvedDefCells?.has(posKey(row, col))}
                />
              );
            }
            if (cell?.kind === 'letter') {
              const k = posKey(row, col);
              return (
                <LetterSlot
                  key={i}
                  row={row}
                  col={col}
                  entry={entryAt.get(k) ?? ''}
                  validated={validatedPositions.has(k)}
                  validating={validatingPositions?.has(k) ?? false}
                  touchPrimary={touchPrimary}
                  highlight={nav.highlightFor({ row, col })}
                  nav={nav}
                  onKeyDown={onKeyDown ?? nav.handleKeyDown}
                  solveDelay={solveDelays.get(k)}
                  celebrateDelay={celebrating.get(k)}
                  rejectShake={rejectingPositions?.has(k)}
                />
              );
            }
            return <div key={i} className={spacer} />;
          })}
        </div>
        {overlay}
      </div>
    </PanZoom>
  );
});
