import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, SignOut } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import type { Cell as DomainCell, Position, Puzzle } from '@/domain';
import type { GameEvent, Unsubscribe } from '@/application/game';
import type { Player, SessionId } from '@/domain/game';
import { Cell, ClueRail, DefCell, Lockup, type CellState } from '@/design-system';
import { DesktopAppBar } from '@/ui/v2/DesktopAppBar';
import { SkipLink } from '@/ui/v2/SkipLink';
import {
  useGridNavigation,
  type CellHighlight,
  type GridNavigation,
} from '@/ui/components/grid/useGridNavigation';
import { orderClues } from '@/ui/components/grid/orderClues';
import { GRID_INPUT_GUARDS } from '@/ui/components/grid/gridInputGuards';
import { CELL, GAP, STRIDE, BOARD_BOTTOM_GAP, posKey, exitsRight } from '@/ui/components/grid/playLayout';
import { Keyboard } from '@/ui/play/Keyboard';
import { usePresenceState } from '@/ui/components/grid/usePresenceState';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { PanZoom, type PanZoomHandle } from '@/ui/play/PanZoom';
import { CoopPresenceLayer } from './CoopPresenceLayer';
import { LiveTimer } from './LiveTimer';
import { PlayerStrip } from './PlayerStrip';
import { useIsDesktop } from '@/ui/lib/useIsDesktop';

// ADR-0072 v2 co-op IN_PROGRESS screen: shared grid + presence + timer + roster, wired like prod InGameView.

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
const header = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4, padding: `12px ${GUTTER} 0`, display: 'flex', flexDirection: 'column', gap: '8px', lg: { position: 'static', width: '100%', paddingTop: '24px', paddingInline: '36px' } });
// Desktop presence row: aligned with the contained board under the shared nav bar.
const coopPresence = css({ display: 'none', lg: { display: 'block', width: '100%', maxWidth: '760px', marginInline: 'auto', paddingInline: '14px', paddingTop: '10px' } });
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
// Desktop caps the viewport at the board's own width so it fills the space without a side-ocean.
const viewportFill = css({ flex: '1', minHeight: 0, lg: { width: '100%', marginInline: 'auto' } });
const DESKTOP_BOARD_PAD = 48;
const boardWrap = css({ position: 'relative', width: 'max-content' });
const boardGrid = css({ display: 'grid', position: 'relative', zIndex: 1 });
const spacer = css({ borderRadius: '9px' });

const cellWrap = css({ position: 'relative', cursor: 'pointer' });
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

const bottomBar = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, display: 'flex', flexDirection: 'column', gap: '10px', padding: `8px ${GUTTER} 14px`, md: { alignItems: 'center', '& > *': { width: '100%', maxWidth: '520px' } }, lg: { position: 'static', paddingBottom: '24px' } });
function LetterSlot({
  row,
  col,
  entry,
  validated,
  highlight,
  nav,
  onKeyDown,
}: {
  readonly row: number;
  readonly col: number;
  readonly entry: string;
  readonly validated: boolean;
  readonly highlight: CellHighlight;
  readonly nav: GridNavigation;
  readonly onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const state: CellState = validated
    ? 'solved'
    : highlight.focused
      ? 'active'
      : highlight.currentWord
        ? 'activeWord'
        : 'empty';
  return (
    <div
      className={cellWrap}
      data-row={row}
      data-col={col}
      onClick={nav.handleClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Cell state={state} />
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

export interface LiveCoopScreenProps {
  readonly puzzle: Puzzle;
  readonly startedAt: string;
  // Authoritative duration once COMPLETED; freezes the timer and lights the grid.
  readonly frozenAtMs?: number;
  readonly isCompleted: boolean;
  readonly sessionId: SessionId;
  readonly players: ReadonlyArray<Player>;
  readonly playersBySessionId: ReadonlyMap<SessionId, Player>;
  readonly initialEntries: ReadonlyArray<{ row: number; column: number; letter: string }>;
  readonly lockedPositions: ReadonlyArray<{ row: number; column: number }>;
  readonly onCellChange: (row: number, col: number, letter: string | null) => void;
  readonly onLocalFocusChange: (position: Position | null, direction: 'across' | 'down' | null) => void;
  readonly subscribeToRemoteCellUpdates: (handler: (event: GameEvent) => void) => Unsubscribe;
  readonly subscribeToRemotePresence: (handler: (event: GameEvent) => void) => Unsubscribe;
  readonly onLeave: () => void;
}

export function LiveCoopScreen({
  puzzle,
  startedAt,
  frozenAtMs,
  isCompleted,
  sessionId,
  players,
  playersBySessionId,
  initialEntries,
  lockedPositions,
  onCellChange,
  onLocalFocusChange,
  subscribeToRemoteCellUpdates,
  subscribeToRemotePresence,
  onLeave,
}: LiveCoopScreenProps) {
  const pzRef = useRef<PanZoomHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(220);
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

  const entryAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of initialEntries) m.set(posKey(e.row, e.column), e.letter);
    return m;
  }, [initialEntries]);

  // Server-locked cells (per-word `wordLocked`); COMPLETED lights every letter.
  const validatedPositions = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    for (const p of lockedPositions) set.add(posKey(p.row, p.column));
    if (isCompleted) {
      for (const c of puzzle.cells) {
        if (c.kind === 'letter') set.add(posKey(c.position.row, c.position.col));
      }
    }
    return set;
  }, [isCompleted, lockedPositions, puzzle.cells]);
  const validatedRef = useRef(validatedPositions);
  validatedRef.current = validatedPositions;

  const revealCell = useCallback((p: Position) => {
    pzRef.current?.reveal(p.col * STRIDE, p.row * STRIDE, CELL, CELL);
  }, []);

  const nav = useGridNavigation(puzzle, {
    onCellChange: isCompleted ? undefined : onCellChange,
    onFocusChange: isCompleted
      ? undefined
      : (position, direction) => {
          onLocalFocusChange(position, direction);
          if (position) revealCell(position);
        },
    getZoomScale: () => 2,
    isCellValidated: (row, col) => validatedRef.current.has(posKey(row, col)),
  });

  // Inbound remote writes land directly on the uncontrolled inputs (ADR-0002 §4), never re-emitting onCellChange.
  const { applyRemoteCellUpdate } = nav;
  useEffect(() => {
    const unsubscribe = subscribeToRemoteCellUpdates((event) => {
      if (event.type !== 'cellUpdated') return;
      applyRemoteCellUpdate(event.row, event.column, event.letter);
    });
    return unsubscribe;
  }, [subscribeToRemoteCellUpdates, applyRemoteCellUpdate]);

  // Peer presence state → typing/idle/lost sets for the roster strip + grid badges.
  const presenceState = usePresenceState(subscribeToRemotePresence, sessionId);
  const typingSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) if (st.typing) set.add(sid);
    return set;
  }, [presenceState]);
  const idleSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) if (st.idle) set.add(sid);
    return set;
  }, [presenceState]);
  const disconnectingSessionIds = useMemo(() => {
    const set = new Set<SessionId>();
    for (const [sid, st] of presenceState) if (st.connectionLost) set.add(sid);
    return set;
  }, [presenceState]);

  // ADR-0050: announce completion once (join/leave + mot validé already announced inside useLobbyConnection).
  const announcer = useAnnouncer();
  const announcedSolvedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !announcedSolvedRef.current) {
      announcedSolvedRef.current = true;
      announcer.say('Grille résolue !');
    }
  }, [isCompleted, announcer]);

  const clue = nav.currentClue;
  const orderedClues = useMemo(() => orderClues(puzzle), [puzzle]);
  // Clue ordinal among all across-then-down clues — drives the rail counter, same as solo PlayScreen.
  const clueOrdinal = useMemo(() => {
    if (!clue) return -1;
    const k = `${clue.definition.position.row}:${clue.definition.position.col}:${clue.clue.arrow}`;
    return orderedClues.findIndex((c) => c.key === k);
  }, [clue, orderedClues]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      nav.handleKeyDown(e);
    },
    [nav],
  );

  return (
    <div className={stage}>
    <SkipLink />
    <main id="main-content" tabIndex={-1} className={shell} lang="fr">
      {isDesktop ? (
        <>
          <DesktopAppBar trailing={<LiveTimer startedAt={startedAt} frozenAtMs={frozenAtMs} />} />
          <div className={coopPresence}>
            <PlayerStrip
              players={players}
              currentSessionId={sessionId}
              typingSessionIds={typingSessionIds}
              idleSessionIds={idleSessionIds}
              disconnectingSessionIds={disconnectingSessionIds}
            />
          </div>
        </>
      ) : (
        <header className={header}>
          <div className={headerBar}>
            <button type="button" className={iconBtn} onClick={onLeave} aria-label="Quitter la partie">
              <CaretLeft aria-hidden="true" weight="bold" />
            </button>
            <Lockup orientation="horizontal" tone="jade" iconSize={26} textSize={17} gap={8} />
            <span className={headerSpacer} />
            <LiveTimer startedAt={startedAt} frozenAtMs={frozenAtMs} />
            <button type="button" className={iconBtn} onClick={onLeave} aria-label="Quitter">
              <SignOut aria-hidden="true" weight="bold" />
            </button>
          </div>
          <PlayerStrip
            players={players}
            currentSessionId={sessionId}
            typingSessionIds={typingSessionIds}
            idleSessionIds={idleSessionIds}
            disconnectingSessionIds={disconnectingSessionIds}
          />
        </header>
      )}

      <PanZoom ref={pzRef} className={viewportFill} style={isDesktop ? { maxWidth: BOARD_W + 2 * DESKTOP_BOARD_PAD } : undefined} contentWidth={BOARD_W} contentHeight={BOARD_H} fit={isDesktop ? 'contain' : 'height'} framePad={isDesktop ? 6 : 14} padTop={isDesktop ? 6 : 104} padBottom={isDesktop ? 6 : bottomInset + BOARD_BOTTOM_GAP} padX={isDesktop ? 6 : 14} maxScale={2.6} edgeFade>
        <div className={boardWrap}>
          <div className={boardGrid} style={{ gridTemplateColumns: `repeat(${puzzle.width}, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: `${GAP}px` }}>
            {Array.from({ length: puzzle.height * puzzle.width }, (_, i) => {
              const row = Math.floor(i / puzzle.width);
              const col = i % puzzle.width;
              const cell = byPos.get(posKey(row, col));
              if (cell?.kind === 'definition') {
                const sorted = [...cell.clues].sort((x, y) => Number(!exitsRight(x.arrow)) - Number(!exitsRight(y.arrow)));
                const active = nav.highlightFor({ row, col }).currentArrow !== null;
                return <DefCell key={i} clues={sorted.map((c) => c.text)} arrows={sorted.map((c) => c.arrow)} active={active} />;
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
                  />
                );
              }
              return <div key={i} className={spacer} />;
            })}
          </div>
          <CoopPresenceLayer
            puzzle={puzzle}
            subscribeToRemotePresence={subscribeToRemotePresence}
            currentSessionId={sessionId}
            playersBySessionId={playersBySessionId}
            validatedPositions={validatedPositions}
            typingSessionIds={typingSessionIds}
            cellSize={CELL}
            gap={GAP}
          />
        </div>
      </PanZoom>

      <div className={bottomBar} ref={bottomRef}>
        {clue && clueOrdinal >= 0 ? (
          <ClueRail
            direction={clue.direction === 'across' ? 'horizontal' : 'vertical'}
            clue={clue.clue.text}
            index={clueOrdinal + 1}
            total={orderedClues.length}
            onPrev={() => nav.cycleClue(-1)}
            onNext={() => nav.cycleClue(1)}
            onZoomIn={() => pzRef.current?.zoomIn()}
            onZoomOut={() => pzRef.current?.zoomOut()}
          />
        ) : null}
        {!isCompleted ? (
          <Keyboard onLetter={(l) => nav.enterLetter(l)} onBackspace={() => nav.eraseLetter()} />
        ) : null}
      </div>
    </main>
    </div>
  );
}
