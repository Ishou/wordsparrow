import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, DotsThreeVertical, Lightbulb, Timer, Trophy } from '@phosphor-icons/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import type { Cell as DomainCell, Position, Puzzle } from '@/domain';
import type { PuzzleSolver } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Button, Cell, DefCell, ClueRail, Lockup, type CellState } from '@/design-system';
import { DesktopAppBar } from '@/ui/v2/DesktopAppBar';
import { SkipLink } from '@/ui/v2/SkipLink';
import { PlayMenu } from './PlayMenu';
import {
  useGridNavigation,
  type CellHighlight,
  type Clue,
  type GridNavigation,
} from '@/ui/components/grid/useGridNavigation';
import { orderClues } from '@/ui/components/grid/orderClues';
import { GRID_INPUT_GUARDS } from '@/ui/components/grid/gridInputGuards';
import { CELL, GAP, STRIDE, BOARD_BOTTOM_GAP, posKey, exitsRight } from '@/ui/components/grid/playLayout';
import { Keyboard } from './Keyboard';
import { useWordAutoValidation } from '@/ui/components/grid/useWordAutoValidation';
import { useHintRequest } from '@/ui/components/grid/useHintRequest';
import { PanZoom, type PanZoomHandle } from './PanZoom';
import { WinScreen } from './WinScreen';
import { useIsDesktop } from '@/ui/lib/useIsDesktop';

const stage = css({
  minHeight: '100dvh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)',
  md: { bgImage: 'none', bg: '#9CCBB1', padding: '32px 24px' },
  // Desktop: drop the surround — the board goes immersive on the full-bleed gradient.
  lg: { bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)', bg: 'transparent', padding: 0, alignItems: 'stretch' },
});
// Immersive phone-shaped shell: the jade field fills it; the grid bleeds within.
const shell = css({
  position: 'relative',
  width: '100%',
  maxWidth: '440px',
  height: '100dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)',
  fontFamily: 'wsUi',
  md: {
    maxWidth: '720px',
    height: 'min(920px, calc(100dvh - 64px))',
    borderRadius: '28px',
    boxShadow: '0 24px 60px rgba(33,75,64,0.18)',
  },
  // Desktop: match the home frame width so the top bars align; the board itself is capped narrower below.
  lg: { maxWidth: '1140px', height: '100dvh', borderRadius: 0, boxShadow: 'none' },
});
const GUTTER = '14px';
// Overlay region: the grid bleeds behind it; pan-inset keeps the top reachable.
const header = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, padding: `12px ${GUTTER} 0`, lg: { position: 'static', width: '100%', paddingTop: '24px', paddingInline: '36px' } });
// Frosted pill holds exit · brand · timer · settings, legible over the bleeding grid.
const headerBar = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '999px',
  padding: '5px 8px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  // Desktop: a plain transparent bar (matching the home top bar), not a frosted floating pill.
  lg: { bg: 'transparent', backdropFilter: 'none', border: 'none', borderRadius: 0, boxShadow: 'none', padding: '0', gap: '14px' },
});
const iconBtn = css({
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'ws.jadeInk',
  fontSize: '18px',
  cursor: 'pointer',
  flex: 'none',
  _active: { background: 'rgba(33,75,64,0.08)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  // Desktop: frosted circle button matching the home top bar's menu button.
  lg: { width: '44px', height: '44px', background: 'rgba(255,255,255,0.62)', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', fontSize: '20px', _hover: { background: 'rgba(255,255,255,0.82)' } },
});
const headerSpacer = css({ flex: 1 });
const brandLink = css({ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', borderRadius: '12px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '4px' } });
const headerTimer = css({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'wsMono', fontWeight: 'semibold', fontSize: '13.5px', color: 'ws.jadeInk', flex: 'none', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', paddingInline: '2px' });
const headerTimerIcon = css({ fontSize: '14px', opacity: 0.55, flex: 'none' });
// Full-bleed: grid bleeds to the edges mid-pan; a gap only appears at the board's edges.
// Desktop caps the viewport at the board's own width so it fills the space without a side-ocean.
const viewportFill = css({ flex: '1', minHeight: 0, lg: { width: '100%', marginInline: 'auto' } });
const DESKTOP_BOARD_PAD = 48;
const boardGrid = css({ display: 'grid' });
const spacer = css({ borderRadius: '9px' });

// Keycap (state visuals) + transparent uncontrolled input on top; cell values in the DOM (ADR-0002 §4).
const cellWrap = css({ position: 'relative', cursor: 'pointer' });
// Sakura halo bloomed around a freshly-solved word's cells during the solve beat.
const cellGlow = css({ borderRadius: '13px', zIndex: 1, animation: 'wsSolveGlow 0.45s ease-out both' });
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

// Overlay bar — its measured height feeds PanZoom's padBottom so the focused cell stays above it.
const bottomBar = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, display: 'flex', flexDirection: 'column', gap: '10px', padding: `8px ${GUTTER} 14px`, md: { alignItems: 'center', '& > *': { width: '100%', maxWidth: '520px' } }, lg: { position: 'static', paddingBottom: '24px' } });
// Compact hint chip, lives in the ClueRail label row (replacing the counter).
const hintBtn = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '3px 9px',
  borderRadius: '999px',
  border: 'none',
  fontFamily: 'wsUi',
  fontWeight: 'bold',
  fontSize: '12px',
  color: 'ws.jadeInk',
  bg: '#F2EDDC',
  cursor: 'pointer',
  _disabled: { opacity: 0.45, cursor: 'not-allowed' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const hintBulb = css({ color: 'ws.or' });
// Post-win: bottom bar becomes a single re-entry to the celebration.
const resultsBtn = css({ width: '100%', gap: '9px' });

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function inputAt(row: number, col: number): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
}

// One letter slot: keycap (state visuals) + transparent input (live value).
function LetterSlot({
  row,
  col,
  entry,
  validated,
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
      className={cx(cellWrap, celebrateDelay !== undefined && cellGlow, rejectShake && cellShake)}
      style={celebrateDelay !== undefined ? { animationDelay: `${celebrateDelay}ms` } : undefined}
      data-row={row}
      data-col={col}
      onClick={nav.handleClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Cell state={state} solveDelay={solveDelay} />
      <input
        ref={nav.registerCellRef}
        {...GRID_INPUT_GUARDS}
        aria-label={`Ligne ${row + 1}, colonne ${col + 1}`}
        defaultValue={entry}
        readOnly={validated}
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

export interface PlayScreenProps {
  readonly puzzle: Puzzle;
  readonly puzzleSolver: PuzzleSolver;
  readonly soloEntriesStore: SoloEntriesStore;
}

export function PlayScreen({ puzzle, puzzleSolver, soloEntriesStore }: PlayScreenProps) {
  const [seconds, setSeconds] = useState(0);
  const [winDismissed, setWinDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const pzRef = useRef<PanZoomHandle>(null);
  // Measured height of the overlay bottom bar — PanZoom reserves it so the focused cell stays above.
  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(280);
  useEffect(() => {
    const el = bottomRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBottomInset(el.offsetHeight));
    setBottomInset(el.offsetHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isDesktop = useIsDesktop();

  const BOARD_W = puzzle.width * CELL + (puzzle.width - 1) * GAP;
  const BOARD_H = puzzle.height * CELL + (puzzle.height - 1) * GAP;

  const byPos = useMemo(() => {
    const m = new Map<string, DomainCell>();
    for (const c of puzzle.cells) m.set(posKey(c.position.row, c.position.col), c);
    return m;
  }, [puzzle]);

  // Persisted letters: seed the uncontrolled inputs and the auto-validation rehydration.
  const initialEntries = useMemo(() => soloEntriesStore.load(puzzle.id), [soloEntriesStore, puzzle.id]);
  const entryAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of initialEntries) m.set(posKey(e.row, e.column), e.letter);
    return m;
  }, [initialEntries]);

  // Hint-revealed cells: locked + correct; `loaded` gates auto-focus until they're restored.
  const [lockedHintCells, setLockedHintCells] = useState<ReadonlySet<string>>(() => new Set());
  const [lockedLoaded, setLockedLoaded] = useState(false);
  useEffect(() => {
    const persisted = soloEntriesStore.loadLockedCells(puzzle.id);
    setLockedHintCells(new Set(persisted.map((c) => posKey(c.row, c.column))));
    setLockedLoaded(true);
  }, [puzzle.id, soloEntriesStore]);

  // Gate the flatten ripple: only cells validated after a real interaction animate.
  const userActedRef = useRef(false);
  const handleCellChange = useCallback(
    (row: number, col: number, letter: string | null) => {
      userActedRef.current = true;
      soloEntriesStore.save(puzzle.id, row, col, letter);
    },
    [soloEntriesStore, puzzle.id],
  );

  const handleWordValidated = useCallback(
    (positions: ReadonlyArray<Position>) => {
      for (const p of positions) soloEntriesStore.lockCell(puzzle.id, p.row, p.col);
      // Marks cells freshly validated so the focus firewall can trigger the solve beat.
      const set = justValidatedRef.current ?? new Set<string>();
      for (const p of positions) set.add(posKey(p.row, p.col));
      justValidatedRef.current = set;
    },
    [soloEntriesStore, puzzle.id],
  );

  // Wrong word: wobble + haptic; reduced motion skips the wobble.
  const handleWordRejected = useCallback((positions: ReadonlyArray<Position>) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([0, 28, 38, 28]);
    if (reduceMotionRef.current) return;
    setRejecting(new Set(positions.map((p) => posKey(p.row, p.col))));
    if (rejectTimerRef.current) window.clearTimeout(rejectTimerRef.current);
    rejectTimerRef.current = window.setTimeout(() => setRejecting(new Set()), 460);
  }, []);

  const autoValidation = useWordAutoValidation(puzzle, puzzleSolver, initialEntries, handleWordValidated, handleWordRejected);

  const handleHintReveal = useCallback(
    (row: number, column: number, letter: string) => {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-cell-kind="letter"][data-row="${row}"][data-col="${column}"]`,
      );
      if (input) input.value = letter;
      soloEntriesStore.save(puzzle.id, row, column, letter);
      soloEntriesStore.lockCell(puzzle.id, row, column);
      setLockedHintCells((prev) => {
        const k = posKey(row, column);
        if (prev.has(k)) return prev;
        const next = new Set(prev);
        next.add(k);
        return next;
      });
      // Triggers full-word solve beat when a hint fills the last cell.
      autoValidation.onCellFilled({ row, col: column }, 'across');
    },
    [soloEntriesStore, puzzle.id, autoValidation],
  );

  const handleHintConsumed = useCallback(() => soloEntriesStore.recordHintUsed(puzzle.id), [soloEntriesStore, puzzle.id]);

  const hint = useHintRequest(puzzle.id, puzzle.hintsRemaining, puzzleSolver, handleHintReveal, handleHintConsumed);

  const validatedPositions = useMemo<ReadonlySet<string>>(() => {
    if (lockedHintCells.size === 0) return autoValidation.validated;
    if (autoValidation.validated.size === 0) return lockedHintCells;
    const merged = new Set<string>(autoValidation.validated);
    for (const k of lockedHintCells) merged.add(k);
    return merged;
  }, [autoValidation.validated, lockedHintCells]);

  // Stable ref so callbacks always read the latest validated set.
  const validatedRef = useRef(validatedPositions);
  validatedRef.current = validatedPositions;

  // Solve beat: brief sakura halo + haptic on completion; interruptible; skipped under reduced motion.
  const [celebrating, setCelebrating] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Cells of a completed-but-wrong word that are currently wobbling.
  const [rejecting, setRejecting] = useState<ReadonlySet<string>>(() => new Set());
  const rejectTimerRef = useRef<number | null>(null);
  // Cells validated this tick, consumed once by the focus firewall to gate the solve beat.
  const justValidatedRef = useRef<Set<string> | null>(null);
  const currentClueRef = useRef<Clue | null>(null);
  const solveBeatRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);
  const cancelSolveBeat = useCallback(() => {
    if (solveBeatRef.current === null) return;
    window.clearTimeout(solveBeatRef.current);
    solveBeatRef.current = null;
    setCelebrating(new Map());
  }, []);
  const beginSolveBeat = useCallback((cells: ReadonlyMap<string, number>, then: () => void) => {
    setCelebrating(cells);
    let last = 0;
    for (const d of cells.values()) last = Math.max(last, d);
    solveBeatRef.current = window.setTimeout(() => {
      solveBeatRef.current = null;
      setCelebrating(new Map());
      then();
    }, last + 480);
  }, []);
  useEffect(() => () => {
    if (solveBeatRef.current) window.clearTimeout(solveBeatRef.current);
    if (rejectTimerRef.current) window.clearTimeout(rejectTimerRef.current);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotionRef.current = mq.matches;
    const onChange = () => { reduceMotionRef.current = mq.matches; };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const revealCell = useCallback((p: Position) => {
    pzRef.current?.reveal(p.col * STRIDE, p.row * STRIDE, CELL, CELL);
  }, []);

  // Last focused cell — survives blur so the out-of-grid hint button can read it.
  const activeFocusRef = useRef<Position | null>(null);

  const nav = useGridNavigation(puzzle, {
    onCellChange: handleCellChange,
    onCellFilled: autoValidation.onCellFilled,
    onFocusChange: (position) => {
      if (!position) return;
      cancelSolveBeat(); // a user tap during the beat skips it (no-op otherwise)
      activeFocusRef.current = position;
      revealCell(position);
    },
    // Force the zoom guard on so PanZoom.reveal() handles scroll avoidance instead of the browser.
    getZoomScale: () => 2,
    isCellValidated: (row, col) => validatedRef.current.has(posKey(row, col)),
  });

  const requestHint = useCallback(() => {
    const f = activeFocusRef.current;
    if (!f || validatedRef.current.has(posKey(f.row, f.col))) return;
    userActedRef.current = true;
    hint.request(f.row, f.col);
  }, [hint]);

  // Tab direction + jump flag so the validated-cell skip can distinguish arrow moves from Tab/cycle.
  const tabDirRef = useRef<1 | -1>(1);
  const jumpPendingRef = useRef(false);
  const cycleClueRef = useRef(nav.cycleClue);
  cycleClueRef.current = nav.cycleClue;

  // Flatten ripple: stagger solveDelay across newly-validated cells, then clear.
  const [solveDelays, setSolveDelays] = useState<ReadonlyMap<string, number>>(() => new Map());
  const prevValidatedRef = useRef<ReadonlySet<string>>(new Set());
  const solveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevValidatedRef.current;
    prevValidatedRef.current = validatedPositions;
    if (!userActedRef.current) return;
    const added = [...validatedPositions].filter((k) => !prev.has(k));
    if (added.length === 0) return;
    added.sort((a, b) => {
      const [ar, ac] = a.split(',').map(Number);
      const [br, bc] = b.split(',').map(Number);
      return ar - br || ac - bc;
    });
    const next = new Map<string, number>();
    added.forEach((k, i) => next.set(k, i * 45));
    setSolveDelays(next);
    if (solveTimerRef.current) window.clearTimeout(solveTimerRef.current);
    solveTimerRef.current = window.setTimeout(() => setSolveDelays(new Map()), (added.length - 1) * 45 + 340);
  }, [validatedPositions]);
  useEffect(() => () => { if (solveTimerRef.current) window.clearTimeout(solveTimerRef.current); }, []);

  // Clues ordered across-then-down; drives the ClueRail counter and the focus firewall.
  const orderedClues = useMemo(() => orderClues(puzzle), [puzzle]);

  // Definition cells whose every clue word is fully solved → lit "done" surface.
  const solvedDefCells = useMemo(() => {
    const wordsByDef = new Map<string, Position[][]>();
    for (const c of orderedClues) {
      const [dr, dc] = c.key.split(':');
      const defKey = `${dr},${dc}`;
      const arr = wordsByDef.get(defKey);
      if (arr) arr.push(c.cells);
      else wordsByDef.set(defKey, [c.cells]);
    }
    const done = new Set<string>();
    for (const [defKey, words] of wordsByDef) {
      if (words.every((w) => w.every((p) => validatedPositions.has(posKey(p.row, p.col))))) done.add(defKey);
    }
    return done;
  }, [orderedClues, validatedPositions]);

  const clue = nav.currentClue;
  currentClueRef.current = clue;
  const clueOrdinal = useMemo(() => {
    if (!clue) return -1;
    const k = `${clue.definition.position.row}:${clue.definition.position.col}:${clue.clue.arrow}`;
    return orderedClues.findIndex((c) => c.key === k);
  }, [clue, orderedClues]);

  // Rail stays mounted: shows live clue on focus, last clue on blur, first unsolved on load.
  const [lastOrdinal, setLastOrdinal] = useState(() => {
    const i = orderedClues.findIndex((c) => c.cells.some((p) => !autoValidation.validated.has(posKey(p.row, p.col))));
    return i < 0 ? 0 : i;
  });
  useEffect(() => {
    if (clueOrdinal >= 0) setLastOrdinal(clueOrdinal);
  }, [clueOrdinal]);
  const displayOrdinal = clueOrdinal >= 0 ? clueOrdinal : lastOrdinal;
  const displayClue = orderedClues[displayOrdinal];

  // Step clues: focused delegates to cycleClue; unfocused continues from the shown clue.
  const stepClue = useCallback(
    (dir: 1 | -1) => {
      cancelSolveBeat(); // stepping the rail during the beat skips it
      tabDirRef.current = dir;
      jumpPendingRef.current = true;
      if (nav.localCursor) {
        nav.cycleClue(dir);
        return;
      }
      const n = orderedClues.length;
      if (n === 0) return;
      const target = orderedClues[((displayOrdinal + dir) % n + n) % n];
      const cell = target.cells.find((p) => !validatedRef.current.has(posKey(p.row, p.col))) ?? target.cells[0];
      inputAt(cell.row, cell.col)?.focus();
    },
    [nav, orderedClues, displayOrdinal, cancelSolveBeat],
  );

  // Auto-frame the active clue when it changes; within-clue moves use per-cell reveal.
  const framedClueRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clue) {
      framedClueRef.current = null;
      return;
    }
    const k = `${clue.definition.position.row}:${clue.definition.position.col}:${clue.clue.arrow}`;
    if (k === framedClueRef.current) return;
    framedClueRef.current = k;
    let minRow = clue.definition.position.row;
    let maxRow = minRow;
    let minCol = clue.definition.position.col;
    let maxCol = minCol;
    for (const c of clue.cells) {
      minRow = Math.min(minRow, c.position.row);
      maxRow = Math.max(maxRow, c.position.row);
      minCol = Math.min(minCol, c.position.col);
      maxCol = Math.max(maxCol, c.position.col);
    }
    pzRef.current?.frame(minCol * STRIDE, minRow * STRIDE, (maxCol - minCol) * STRIDE + CELL, (maxRow - minRow) * STRIDE + CELL);
  }, [clue]);

  // /play backspace always moves: after an in-place erase, nudge focus to the previous cell.
  const playBackspace = useCallback(() => {
    const cur = nav.localCursor;
    const el = cur ? inputAt(cur.position.row, cur.position.col) : null;
    const erasedInPlace = !!el && !el.readOnly && el.value !== '';
    nav.eraseLetter();
    if (!cur || !erasedInPlace) return;
    const cl = orderedClues.find(
      (c) => c.across === (cur.direction === 'across') && c.cells.some((p) => p.row === cur.position.row && p.col === cur.position.col),
    );
    if (!cl) return;
    const idx = cl.cells.findIndex((p) => p.row === cur.position.row && p.col === cur.position.col);
    if (idx > 0) inputAt(cl.cells[idx - 1].row, cl.cells[idx - 1].col)?.focus();
  }, [nav, orderedClues]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        playBackspace();
        return;
      }
      if (e.key === 'Tab') {
        tabDirRef.current = e.shiftKey ? -1 : 1;
        jumpPendingRef.current = true;
      }
      nav.handleKeyDown(e);
    },
    [nav, playBackspace],
  );

  // Walks along vec skipping validated cells; adjacent crosses gaps, jump stops at word boundary.
  const findNextEditable = useCallback(
    (from: Position, vec: { dr: number; dc: number }, validated: ReadonlySet<string>, adjacent: boolean): Position | null => {
      if (vec.dr === 0 && vec.dc === 0) return null;
      let r = from.row + vec.dr;
      let c = from.col + vec.dc;
      while (r >= 0 && r < puzzle.height && c >= 0 && c < puzzle.width) {
        const cell = byPos.get(posKey(r, c));
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
    [byPos, puzzle.height, puzzle.width],
  );

  const letterCount = useMemo(() => puzzle.cells.filter((c) => c.kind === 'letter').length, [puzzle]);
  const won = letterCount > 0 && validatedPositions.size >= letterCount;

  // Auto-focus the first unsolved cell on mount; safe because inputMode="none" suppresses the keyboard.
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (didAutoFocusRef.current || won || !lockedLoaded) return;
    const cl = orderedClues.find((c) => c.cells.some((p) => !validatedPositions.has(posKey(p.row, p.col))));
    const target = cl?.cells.find((p) => !validatedPositions.has(posKey(p.row, p.col)));
    if (!cl || !target) return;
    didAutoFocusRef.current = true;
    inputAt(target.row, target.col)?.focus();
    // Toggle direction when the auto-focused clue is vertical (hook starts at 'across').
    if (!cl.across) nav.toggleDirection();
  }, [orderedClues, validatedPositions, won, lockedLoaded, nav]);

  // Skip validated cells: adjacent move stays in direction (dead-end reverts), jump walks to first editable.
  const fRow = nav.localCursor?.position.row ?? -1;
  const fCol = nav.localCursor?.position.col ?? -1;
  const fDir = nav.localCursor?.direction ?? 'across';
  const prevFocusRef = useRef<Position | null>(null);
  useEffect(() => {
    const wasJump = jumpPendingRef.current;
    jumpPendingRef.current = false;
    // Consume any words that validated this tick once (gates the solve beat).
    const justValidated = justValidatedRef.current;
    justValidatedRef.current = null;
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
    } else if (!adjacent && !won && fullySolved) {
      const advance = () => {
        jumpPendingRef.current = true;
        cycleClueRef.current(tabDirRef.current);
      };
      // Celebrate only when THIS word just validated, not when tabbing onto an already-solved clue.
      const celebrate = !!justValidated && wordKeys.some((k) => justValidated.has(k));
      if (celebrate) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(14);
        if (!reduceMotionRef.current) {
          const halo = new Map<string, number>();
          wordKeys.forEach((k, i) => halo.set(k, i * 45));
          beginSolveBeat(halo, advance);
          return;
        }
      }
      advance();
    }
  }, [fRow, fCol, fDir, validatedPositions, findNextEditable, won, beginSolveBeat]);

  const handleReplay = useCallback(() => {
    soloEntriesStore.clearForPuzzle(puzzle.id);
    window.location.reload();
  }, [soloEntriesStore, puzzle.id]);

  const handleShare = useCallback(() => {
    const text = "J'ai terminé la grille WordSparrow du jour ! 🌸";
    if (typeof navigator !== 'undefined' && navigator.share) {
      void navigator.share({ text }).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(text).catch(() => {});
    }
  }, []);

  const timeLabel = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

  useEffect(() => {
    if (won) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [won]);

  return (
    <div className={stage}>
    <SkipLink />
    <main id="main-content" tabIndex={-1} className={shell} lang="fr">
      {isDesktop ? (
        <DesktopAppBar
          trailing={
            <span className={headerTimer} aria-label={`Temps ${timeLabel}`}>
              <Timer aria-hidden="true" weight="bold" className={headerTimerIcon} />
              {timeLabel}
            </span>
          }
        />
      ) : (
        <header className={header}>
          <div className={headerBar}>
            <button type="button" className={iconBtn} onClick={() => navigate({ to: '/' })} aria-label="Quitter la grille">
              <CaretLeft aria-hidden="true" weight="bold" />
            </button>
            <Link to="/" className={brandLink} aria-label="Accueil">
              <Lockup orientation="horizontal" tone="jade" iconSize={26} textSize={17} gap={8} />
            </Link>
            <span className={headerSpacer} />
            <span className={headerTimer} aria-label={`Temps ${timeLabel}`}>
              <Timer aria-hidden="true" weight="bold" className={headerTimerIcon} />
              {timeLabel}
            </span>
            <button type="button" className={iconBtn} onClick={() => setMenuOpen(true)} aria-label="Réglages">
              <DotsThreeVertical aria-hidden="true" weight="bold" />
            </button>
          </div>
        </header>
      )}

      <PanZoom ref={pzRef} className={viewportFill} style={isDesktop ? { maxWidth: BOARD_W + 2 * DESKTOP_BOARD_PAD } : undefined} contentWidth={BOARD_W} contentHeight={BOARD_H} fit={isDesktop ? 'contain' : 'height'} framePad={isDesktop ? 6 : 14} padTop={isDesktop ? 6 : 68} padBottom={isDesktop ? 6 : bottomInset + BOARD_BOTTOM_GAP} padX={isDesktop ? 6 : 14} maxScale={2.6} edgeFade>
        <div className={boardGrid} style={{ gridTemplateColumns: `repeat(${puzzle.width}, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: `${GAP}px` }}>
          {Array.from({ length: puzzle.height * puzzle.width }, (_, i) => {
            const row = Math.floor(i / puzzle.width);
            const col = i % puzzle.width;
            const cell = byPos.get(posKey(row, col));
            if (cell?.kind === 'definition') {
              const sorted = [...cell.clues].sort((x, y) => Number(!exitsRight(x.arrow)) - Number(!exitsRight(y.arrow)));
              const active = nav.highlightFor({ row, col }).currentArrow !== null;
              return <DefCell key={i} clues={sorted.map((c) => c.text)} arrows={sorted.map((c) => c.arrow)} active={active} validated={solvedDefCells.has(posKey(row, col))} />;
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
                  highlight={nav.highlightFor({ row, col })}
                  nav={nav}
                  onKeyDown={handleKeyDown}
                  solveDelay={solveDelays.get(k)}
                  celebrateDelay={celebrating.get(k)}
                  rejectShake={rejecting.has(k)}
                />
              );
            }
            return <div key={i} className={spacer} />;
          })}
        </div>
      </PanZoom>

      {won && !winDismissed ? (
        <WinScreen time={timeLabel} onReplay={handleReplay} onShare={handleShare} onDismiss={() => setWinDismissed(true)} />
      ) : null}

      <PlayMenu open={menuOpen} onClose={() => setMenuOpen(false)} onRecommencer={handleReplay} />

      <div className={bottomBar} ref={bottomRef}>
        {won ? (
          <Button variant="secondary" className={resultsBtn} onClick={() => setWinDismissed(false)}>
            <Trophy aria-hidden="true" weight="fill" />
            Voir les résultats
          </Button>
        ) : (
          <>
            {displayClue ? (
              <ClueRail
                direction={displayClue.across ? 'horizontal' : 'vertical'}
                clue={displayClue.text}
                index={displayOrdinal + 1}
                total={orderedClues.length}
                onPrev={() => stepClue(-1)}
                onNext={() => stepClue(1)}
                onZoomIn={() => pzRef.current?.zoomIn()}
                onZoomOut={() => pzRef.current?.zoomOut()}
                trailing={
                  <button
                    type="button"
                    className={hintBtn}
                    onClick={requestHint}
                    disabled={hint.exhausted || hint.pending}
                    aria-label={`Indice — ${hint.hintsRemaining} restants`}
                  >
                    <Lightbulb aria-hidden="true" weight="fill" className={hintBulb} />
                    Indice · {hint.hintsRemaining}
                  </button>
                }
              />
            ) : null}
            <Keyboard onLetter={(l) => nav.enterLetter(l)} onBackspace={playBackspace} />
          </>
        )}
      </div>
    </main>
    </div>
  );
}
