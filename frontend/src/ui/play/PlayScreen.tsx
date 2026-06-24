import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, DotsThreeVertical, Lightbulb, Timer, Trophy } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import type { ArrowDirection, Cell as DomainCell, Position, Puzzle } from '@/domain';
import type { PuzzleSolver } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Button, Cell, DefCell, ClueRail, KeyboardKey, Lockup, type CellState } from '@/design-system';
import { PlayMenu } from './PlayMenu';
import {
  useGridNavigation,
  type CellHighlight,
  type Clue,
  type GridNavigation,
} from '@/ui/components/grid/useGridNavigation';
import { useWordAutoValidation } from '@/ui/components/grid/useWordAutoValidation';
import { useHintRequest } from '@/ui/components/grid/useHintRequest';
import { PanZoom, type PanZoomHandle } from './PanZoom';
import { WinScreen } from './WinScreen';

// Fixed board geometry: the grid never reflows — PanZoom scales/pans it.
const CELL = 56;
const GAP = 5;
const STRIDE = CELL + GAP;
// Breathing gap between the last row and the bottom bar at the pan extreme
// (mirrors padTop's gap above the first row under the header).
const BOARD_BOTTOM_GAP = 14;

const KEY_ROWS = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['W', 'X', 'C', 'V', 'B', 'N'],
] as const;

const exitsRight = (a: ArrowDirection) => a === 'right' || a === 'right-down';

// Immersive phone-shaped shell: the jade field fills it; the grid bleeds within.
const shell = css({ position: 'relative', width: '100%', maxWidth: '440px', marginInline: 'auto', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)', fontFamily: 'wsUi' });
const GUTTER = '14px';
// Overlay region: the grid bleeds behind it; pan-inset keeps the top reachable.
const header = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, padding: `12px ${GUTTER} 0` });
// One frosted pill holds exit · brand · timer · settings, legible over the
// bleeding grid without per-element glow.
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
});
const headerSpacer = css({ flex: 1 });
const headerTimer = css({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'wsMono', fontWeight: 'semibold', fontSize: '13.5px', color: 'ws.jadeInk', flex: 'none', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', paddingInline: '2px' });
const headerTimerIcon = css({ fontSize: '14px', opacity: 0.55, flex: 'none' });
// Full-bleed: grid bleeds to the edges mid-pan; a gap only appears at the board's edges.
const viewportFill = css({ flex: '1', minHeight: 0 });
const boardGrid = css({ display: 'grid' });
const spacer = css({ borderRadius: '9px' });

// Each letter slot: the design-system keycap renders the state visuals; a
// transparent uncontrolled <input> sits on top carrying the live letter
// (cell values live in the DOM per ADR-0002 §4, never in React state).
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

// Overlay bar: the grid bleeds behind it (same as the header). Its measured
// height feeds PanZoom's padBottom so the focused cell stays above it.
const bottomBar = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, display: 'flex', flexDirection: 'column', gap: '10px', padding: `8px ${GUTTER} 14px` });
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
});
const hintBulb = css({ color: 'ws.or' });
// Every key the same fixed width (sized to fit 10 per row, gap 5px); shorter
// rows centre rather than stretch.
const keyboard = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '7px',
  alignItems: 'stretch',
  width: '100%',
  // Frosted glass panel — same treatment as the header bar; the grid bleeds
  // behind it, calmed and blurred.
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '18px',
  padding: '9px 10px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  '& button': { flex: 'none', width: 'calc((100% - 45px) / 10)', minWidth: 0 },
});
const keyRow = css({ display: 'flex', gap: '5px', justifyContent: 'center' });
// Post-win: the keyboard/clue rail are dead, so the bottom bar becomes a single
// re-entry back to the celebration.
const resultsBtn = css({ width: '100%', gap: '9px' });

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function posKey(row: number, col: number): string {
  return `${row},${col}`;
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
    // mousedown-preventDefault stops the input focusing on pointer-down, so a
    // pan that starts on a cell never selects it; focus happens only on a real
    // click (handleClick), mirroring the prod grid.
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
        type="search"
        role="textbox"
        inputMode="none"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        data-1p-ignore=""
        data-lpignore="true"
        data-form-type="other"
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
  // Measured height of the overlay bottom bar — reserved by PanZoom so the
  // grid bleeds behind it while the focused cell stays above it.
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

  // Hint-revealed cells: locked + correct, persisted across reloads. `loaded`
  // gates the mount auto-focus so it sees hint-locks before choosing a cell.
  const [lockedHintCells, setLockedHintCells] = useState<ReadonlySet<string>>(() => new Set());
  const [lockedLoaded, setLockedLoaded] = useState(false);
  useEffect(() => {
    const persisted = soloEntriesStore.loadLockedCells(puzzle.id);
    setLockedHintCells(new Set(persisted.map((c) => posKey(c.row, c.column))));
    setLockedLoaded(true);
  }, [puzzle.id, soloEntriesStore]);

  // Gate the flatten ripple so cells rehydrated-as-solved on reload don't all
  // animate; only words validated after a real interaction ripple.
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
      // Mark this word's cells as freshly validated so the firewall plays the
      // solve beat (accumulates across words that validate in the same tick).
      const set = justValidatedRef.current ?? new Set<string>();
      for (const p of positions) set.add(posKey(p.row, p.col));
      justValidatedRef.current = set;
    },
    [soloEntriesStore, puzzle.id],
  );

  // A completed word came back wrong: wobble its cells + an error haptic so the
  // player knows to fix it (the word stays editable). Reduced motion → haptic
  // only. (reduceMotionRef / setRejecting are declared below; read at call time.)
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
      // Validate like a typed letter would: a hint that fills a word's last
      // cell must lock (and can celebrate) the whole word, not just the cell.
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

  // Keep the latest validated set readable from stable callbacks (the hint
  // button resolves the focused cell lazily at click time).
  const validatedRef = useRef(validatedPositions);
  validatedRef.current = validatedPositions;

  // Solve beat: when a word is completed, hold on it briefly — a sakura halo
  // ripples its cells + a haptic buzz — before the view advances, so the "your
  // word was good" feedback registers instead of zapping straight to the next
  // clue. Interruptible: a tap or Next skips it. Skipped under reduced motion
  // (haptic only). celebrating maps each solved cell → its halo stagger (ms).
  const [celebrating, setCelebrating] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Cells of a completed-but-wrong word that are currently wobbling.
  const [rejecting, setRejecting] = useState<ReadonlySet<string>>(() => new Set());
  const rejectTimerRef = useRef<number | null>(null);
  // Cells of words that validated this tick (set by onWordValidated), consumed
  // once by the focus firewall to gate the solve beat. The current clue (the
  // word being left) is read from a ref so the firewall can glow the WHOLE word.
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
    // Force the zoom guard on so prod's window-scroll keyboard-avoidance never
    // fires; PanZoom.reveal() keeps the focused cell visible instead.
    getZoomScale: () => 2,
    isCellValidated: (row, col) => validatedRef.current.has(posKey(row, col)),
  });

  const requestHint = useCallback(() => {
    const f = activeFocusRef.current;
    if (!f || validatedRef.current.has(posKey(f.row, f.col))) return;
    userActedRef.current = true;
    hint.request(f.row, f.col);
  }, [hint]);

  // Tab/cycle direction, so skipping over a fully-solved clue continues the way
  // you were going. cycleClueRef avoids depending on the churning `nav` object.
  // jumpPendingRef marks a Tab/cycle jump so the skip below classifies it as a
  // jump even when it lands adjacent (clue starts in the same row), instead of
  // mistaking it for an arrow move and reverting — which looped.
  const tabDirRef = useRef<1 | -1>(1);
  const jumpPendingRef = useRef(false);
  const cycleClueRef = useRef(nav.cycleClue);
  cycleClueRef.current = nav.cycleClue;

  // Flatten ripple: stagger a solveDelay across cells that just entered the
  // validated set (a freshly-solved word, or a hint-revealed cell), then clear.
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

  // Ordered clue list (across-then-down, by start cell) with each clue's
  // letter cells — drives the ClueRail counter (same order cycleClue walks)
  // and the validated-cell focus firewall below.
  const orderedClues = useMemo(() => {
    const list: { key: string; startRow: number; startCol: number; across: boolean; text: string; cells: Position[] }[] = [];
    for (const cell of puzzle.cells) {
      if (cell.kind !== 'definition') continue;
      for (const clue of cell.clues) {
        const a = clue.arrow;
        const startDr = a === 'down' || a === 'down-right' ? 1 : 0;
        const startDc = a === 'right' || a === 'right-down' ? 1 : 0;
        const dr = a === 'down' || a === 'right-down' ? 1 : 0;
        const dc = a === 'right' || a === 'down-right' ? 1 : 0;
        const across = a === 'right' || a === 'down-right';
        const cells: Position[] = [];
        let r = cell.position.row + startDr;
        let c = cell.position.col + startDc;
        while (r >= 0 && r < puzzle.height && c >= 0 && c < puzzle.width) {
          const nx = byPos.get(posKey(r, c));
          if (!nx || nx.kind !== 'letter') break;
          cells.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
        if (cells.length === 0) continue;
        list.push({ key: `${cell.position.row}:${cell.position.col}:${a}`, startRow: cell.position.row + startDr, startCol: cell.position.col + startDc, across, text: clue.text, cells });
      }
    }
    list.sort((x, y) => x.startRow - y.startRow || x.startCol - y.startCol || (x.across === y.across ? 0 : x.across ? -1 : 1));
    return list;
  }, [puzzle, byPos]);

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

  // The rail stays mounted with no focused cell: it shows the live clue when
  // one is focused, the last shown clue after blur, and the first unsolved
  // clue on load (seeded to match the mount auto-focus below — no flash).
  const [lastOrdinal, setLastOrdinal] = useState(() => {
    const i = orderedClues.findIndex((c) => c.cells.some((p) => !autoValidation.validated.has(posKey(p.row, p.col))));
    return i < 0 ? 0 : i;
  });
  useEffect(() => {
    if (clueOrdinal >= 0) setLastOrdinal(clueOrdinal);
  }, [clueOrdinal]);
  const displayOrdinal = clueOrdinal >= 0 ? clueOrdinal : lastOrdinal;
  const displayClue = orderedClues[displayOrdinal];

  // Step clues from the rail. Focused → the hook's cycleClue (keeps its
  // tab/jump nuance); unfocused → continue from the shown clue rather than
  // snapping to the first/last, focusing its first editable cell.
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

  // Auto-frame the active clue (def-cell + word) when it changes — zoom out
  // only to fit, animated. Within-clue cursor moves stay on the per-cell reveal.
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

  // Backspace that always steps back: the hook erases a filled cell in place
  // (correct for /grille), but in /play we want every press to move, so after
  // an in-place erase we nudge focus to the previous cell. The hook's
  // eraseLetter still does the erase + persistence + value-mirror sync.
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

  // Walk from `from` along `vec`, skipping validated cells, to the first
  // editable one. `adjacent` (arrow/type) crosses non-letter gaps to the next
  // typeable cell in the row/col; a jump (Tab/cycle) stops at the word
  // boundary. Never jumps to another clue — Tab order stays the hook's job, so
  // the skip can't fight cycleClue's direction (which broke Shift+Tab + looped).
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

  // On first mount, select the first unsolved clue so the rail's clue is the
  // active one (def-cell ringed, first cell focused). Safe to auto-focus: the
  // letter inputs are inputMode="none", so no native keyboard pops.
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (didAutoFocusRef.current || won || !lockedLoaded) return;
    const cl = orderedClues.find((c) => c.cells.some((p) => !validatedPositions.has(posKey(p.row, p.col))));
    const target = cl?.cells.find((p) => !validatedPositions.has(posKey(p.row, p.col)));
    if (!cl || !target) return;
    didAutoFocusRef.current = true;
    inputAt(target.row, target.col)?.focus();
    // Focusing a crossing cell resumes the across clue; match the clue we
    // picked. Direction is still the hook's initial 'across' here (this is
    // the first focus), so one toggle orients a vertical clue to 'down'.
    if (!cl.across) nav.toggleDirection();
  }, [orderedClues, validatedPositions, won, lockedLoaded, nav]);

  // Validated cells must never hold focus, without touching the hook's refined
  // key handling. Infer intent from the focus delta:
  //  - adjacent move (arrow / type / erase): skip in that direction only; at a
  //    dead-end revert to where we came from — never jump clues, never loop.
  //  - non-adjacent jump (Tab / cycle): walk within the landed clue to its first
  //    editable cell; if the whole clue is solved, advance to the next clue via
  //    the hook in the Tab direction (so it can't fight cycleClue / loop).
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
    // The current word being left, and whether it's FULLY solved. A wrong or
    // still-incomplete word (even one whose boundary cell a crossing already
    // validated) keeps focus so the player can fix it: never skip across to a
    // DIFFERENT word, never jump to the next clue, never glow.
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
      // Celebrate only when THIS word just validated (not when tabbing onto an
      // already-solved clue). Haptic either way; visual hold skipped if reduced.
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
    <main className={shell} lang="fr">
      <header className={header}>
        <div className={headerBar}>
          <button type="button" className={iconBtn} onClick={() => navigate({ to: '/' })} aria-label="Quitter la grille">
            <CaretLeft aria-hidden="true" weight="bold" />
          </button>
          <Lockup orientation="horizontal" tone="jade" iconSize={26} textSize={17} gap={8} />
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

      <PanZoom ref={pzRef} className={viewportFill} contentWidth={BOARD_W} contentHeight={BOARD_H} fit="height" framePad={14} padTop={68} padBottom={bottomInset + BOARD_BOTTOM_GAP} padX={14} maxScale={2.6} edgeFade>
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
            <div className={keyboard}>
              {KEY_ROWS.map((rowKeys, r) => (
                <div key={r} className={keyRow}>
                  {rowKeys.map((l) => (
                    <KeyboardKey key={l} type="letter" label={l} onPress={() => nav.enterLetter(l)} />
                  ))}
                  {r === KEY_ROWS.length - 1 ? <KeyboardKey type="backspace" onPress={playBackspace} /> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
