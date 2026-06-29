import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, DotsThreeVertical, Lightbulb, Timer, Trophy } from '@phosphor-icons/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { Position, Puzzle } from '@/domain';
import type { PuzzleSolver } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { Button, ClueRail, Lockup } from '@/design-system';
import { DesktopAppBar } from '@/ui/v2/DesktopAppBar';
import { MenuSheet } from '@/ui/v2/MenuSheet';
import { SkipLink } from '@/ui/v2/SkipLink';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';
import { orderClues } from '@/ui/components/grid/orderClues';
import { CELL, STRIDE, BOARD_BOTTOM_GAP, posKey } from '@/ui/components/grid/playLayout';
import { PuzzleBoard, type PuzzleBoardHandle } from '@/ui/components/grid/PuzzleBoard';
import { useAdvanceOnValidation, inputAt } from '@/ui/components/grid/useAdvanceOnValidation';
import { Keyboard } from './Keyboard';
import { useTouchPrimary, useResumeBlurOnPwa } from '@/ui/components/keyboard';
import { useWordAutoValidation } from '@/ui/components/grid/useWordAutoValidation';
import { useHintRequest } from '@/ui/components/grid/useHintRequest';
import { WinScreen } from './WinScreen';
import { formatClock } from '@/ui/lib/formatClock';
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
  // Desktop: full-bleed play field so the board can zoom to the full window width (the app bar is full-bleed too).
  lg: { maxWidth: 'none', height: '100dvh', borderRadius: 0, boxShadow: 'none' },
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
// Mobile bleeds full-field; desktop viewport is the clear band between the 72px app bar and the ~140px clue rail, so the grid fits inside it.
const viewportFill = css({ flex: '1', minHeight: 0, lg: { position: 'absolute', top: '72px', left: 0, right: 0, bottom: '140px' } });

// Overlay bar (padBottom drives focus-reveal); no top-pad — board reserves BOARD_BOTTOM_GAP below itself.
const bottomBar = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, display: 'flex', flexDirection: 'column', gap: '10px', padding: `0 ${GUTTER} 14px`, md: { alignItems: 'center', '& > *': { width: '100%', maxWidth: '520px' } }, lg: { paddingBottom: '24px' } });
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
// Inline hint error (e.g. 401 → "Connecte-toi…"); compact pill style to match the hint chip.
const hintError = css({
  alignSelf: 'center',
  padding: '4px 11px',
  borderRadius: '999px',
  fontFamily: 'wsUi',
  fontWeight: 'semibold',
  fontSize: '12px',
  color: 'ws.sakuraDark',
  bg: '#FBEEF2',
});
// Post-win: bottom bar becomes a single re-entry to the celebration.
const resultsBtn = css({ width: '100%', gap: '9px' });


export interface PlayScreenProps {
  readonly puzzle: Puzzle;
  readonly puzzleSolver: PuzzleSolver;
  readonly soloEntriesStore: SoloEntriesStore;
}

export function PlayScreen({ puzzle, puzzleSolver, soloEntriesStore }: PlayScreenProps) {
  // Resume from the persisted elapsed time (synced across devices via the progress blob) instead of restarting at 0.
  const [seconds, setSeconds] = useState(() => soloEntriesStore.loadElapsed(puzzle.id));
  const [winDismissed, setWinDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const boardRef = useRef<PuzzleBoardHandle>(null);
  const touchPrimary = useTouchPrimary();
  // Pre-emptive blur on hide so reopening the PWA doesn't re-pop the OS keyboard (inputMode="none" is ignored on resume).
  useResumeBlurOnPwa(touchPrimary);
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

  // Persisted letters: seed the uncontrolled inputs and the auto-validation rehydration.
  const initialEntries = useMemo(() => soloEntriesStore.load(puzzle.id), [soloEntriesStore, puzzle.id]);
  const entryAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of initialEntries) m.set(posKey(e.row, e.column), e.letter);
    return m;
  }, [initialEntries]);

  // Locked cells (hint-revealed + auto-validated words) seed synchronously from the store so validated cells never paint unvalidated first.
  const loadLocked = useCallback(
    (id: string) => new Set(soloEntriesStore.loadLockedCells(id).map((c) => posKey(c.row, c.column))),
    [soloEntriesStore],
  );
  const [lockedHintCells, setLockedHintCells] = useState<ReadonlySet<string>>(() => loadLocked(puzzle.id));
  const [lockedLoaded, setLockedLoaded] = useState(true);
  useEffect(() => {
    setLockedHintCells(loadLocked(puzzle.id));
    setLockedLoaded(true);
  }, [puzzle.id, loadLocked]);

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

  // Cells of a completed-but-wrong word that are currently wobbling.
  const [rejecting, setRejecting] = useState<ReadonlySet<string>>(() => new Set());
  const rejectTimerRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);
  useEffect(() => () => {
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

  // Last focused cell — survives blur so the out-of-grid hint button can read it.
  const activeFocusRef = useRef<Position | null>(null);

  const nav = useGridNavigation(puzzle, {
    onCellChange: handleCellChange,
    onCellFilled: autoValidation.onCellFilled,
    onFocusChange: (position) => {
      if (!position) return;
      boardRef.current?.cancelBeat(); // a user tap during the beat skips it (no-op otherwise)
      activeFocusRef.current = position;
      boardRef.current?.revealCell(position);
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

  const letterCount = useMemo(() => puzzle.cells.filter((c) => c.kind === 'letter').length, [puzzle]);
  const won = letterCount > 0 && validatedPositions.size >= letterCount;

  // Shared focus-advance firewall: after a word validates, move the cursor to the next word.
  const advance = useAdvanceOnValidation({ puzzle, nav, validatedPositions, currentClue: nav.currentClue, completed: won });

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
      boardRef.current?.cancelBeat(); // stepping the rail during the beat skips it
      advance.markJump(dir);
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
    [nav, orderedClues, displayOrdinal, advance],
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
    boardRef.current?.panZoom?.frame(minCol * STRIDE, minRow * STRIDE, (maxCol - minCol) * STRIDE + CELL, (maxRow - minRow) * STRIDE + CELL);
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
        advance.markJump(e.shiftKey ? -1 : 1);
      }
      nav.handleKeyDown(e);
    },
    [nav, playBackspace, advance],
  );

  // userActedRef gates out the mount-time validation of persisted entries, so reviewing a done grid never celebrates.
  const [wonLive, setWonLive] = useState(false);
  useEffect(() => {
    if (won && userActedRef.current) setWonLive(true);
  }, [won]);

  // Desktop only: touch devices pop the native keyboard on programmatic focus despite inputMode="none".
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (didAutoFocusRef.current || won || !lockedLoaded || touchPrimary) return;
    const cl = orderedClues.find((c) => c.cells.some((p) => !validatedPositions.has(posKey(p.row, p.col))));
    const target = cl?.cells.find((p) => !validatedPositions.has(posKey(p.row, p.col)));
    if (!cl || !target) return;
    didAutoFocusRef.current = true;
    inputAt(target.row, target.col)?.focus();
    // Toggle direction when the auto-focused clue is vertical (hook starts at 'across').
    if (!cl.across) nav.toggleDirection();
  }, [orderedClues, validatedPositions, won, lockedLoaded, nav, touchPrimary]);

  const handleReplay = useCallback(() => {
    soloEntriesStore.clearForPuzzle(puzzle.id);
    window.location.reload();
  }, [soloEntriesStore, puzzle.id]);

  const timeLabel = formatClock(seconds);

  useEffect(() => {
    if (won) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [won]);

  // Latest tick, so the coalesced writers read it without re-subscribing every second.
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  // Coalesce localStorage writes: every 5s while running, plus on hide/unmount so a reload resumes the time.
  useEffect(() => {
    const persist = () => soloEntriesStore.saveElapsed(puzzle.id, secondsRef.current);
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    const id = won ? undefined : window.setInterval(persist, 5000);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      if (id !== undefined) window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      persist();
    };
  }, [soloEntriesStore, puzzle.id, won]);

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

      <PuzzleBoard
        ref={boardRef}
        puzzle={puzzle}
        nav={nav}
        validatedPositions={validatedPositions}
        validatingPositions={autoValidation.validating}
        entryAt={entryAt}
        solvedDefCells={solvedDefCells}
        rejectingPositions={rejecting}
        className={viewportFill}
        padTop={isDesktop ? 18 : 68}
        padBottom={isDesktop ? 6 : bottomInset + BOARD_BOTTOM_GAP}
        padX={isDesktop ? 24 : 14}
        edgeFade
        onKeyDown={handleKeyDown}
        celebrateGuard={() => userActedRef.current}
        onBeatComplete={advance.onBeatComplete}
      />

      {wonLive && !winDismissed ? (
        <WinScreen time={timeLabel} onReplay={handleReplay} onDismiss={() => setWinDismissed(true)} />
      ) : null}

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className={bottomBar} ref={bottomRef}>
        {won ? (
          <Button variant="secondary" className={resultsBtn} onClick={() => { setWonLive(true); setWinDismissed(false); }}>
            <Trophy aria-hidden="true" weight="fill" />
            Voir les résultats
          </Button>
        ) : (
          <>
            {hint.errorMessage ? (
              <p className={hintError} role="alert">
                {hint.errorMessage}
              </p>
            ) : null}
            {displayClue ? (
              <ClueRail
                direction={displayClue.across ? 'horizontal' : 'vertical'}
                clue={displayClue.text}
                index={displayOrdinal + 1}
                total={orderedClues.length}
                onPrev={() => stepClue(-1)}
                onNext={() => stepClue(1)}
                onZoomIn={() => boardRef.current?.panZoom?.zoomIn()}
                onZoomOut={() => boardRef.current?.panZoom?.zoomOut()}
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
