import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, SignOut } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import type { ArrowDirection, Cell as DomainCell, Position, Puzzle } from '@/domain';
import type { GameEvent, Unsubscribe } from '@/application/game';
import type { Player, SessionId } from '@/domain/game';
import { Cell, DefCell, Lockup, type CellState } from '@/design-system';
import {
  useGridNavigation,
  type CellHighlight,
  type GridNavigation,
} from '@/ui/components/grid/useGridNavigation';
import { usePresenceState } from '@/ui/components/grid/usePresenceState';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { PanZoom, type PanZoomHandle } from '@/ui/play/PanZoom';
import { CoopPresenceLayer } from './CoopPresenceLayer';
import { LiveTimer } from './LiveTimer';
import { PlayerStrip } from './PlayerStrip';

// v2 co-op IN_PROGRESS screen (ADR-0072): the shared mots-fléchés grid, peer
// presence, the live timer and the roster. Mirrors prod `InGameView` data
// wiring (local edits → cellUpdate, remote `cellUpdated` applied to the
// uncontrolled inputs, server `wordLocked` drives validation) but renders the
// design-system Cell/DefCell board inside the immersive jade shell `/v2/play`
// uses. No local validation — the server is authoritative (AsyncAPI omits the
// canonical answer; `gameSolved` lights the whole grid).

const CELL = 56;
const GAP = 5;
const STRIDE = CELL + GAP;
const BOARD_BOTTOM_GAP = 14;

const KEY_ROWS = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['W', 'X', 'C', 'V', 'B', 'N'],
] as const;

const exitsRight = (a: ArrowDirection) => a === 'right' || a === 'right-down';

const shell = css({ position: 'relative', width: '100%', maxWidth: '440px', marginInline: 'auto', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)', fontFamily: 'wsUi' });
const GUTTER = '14px';
const header = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4, padding: `12px ${GUTTER} 0`, display: 'flex', flexDirection: 'column', gap: '8px' });
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
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraDark)', outlineOffset: '2px' },
});
const headerSpacer = css({ flex: 1 });
const viewportFill = css({ flex: '1', minHeight: 0 });
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

const bottomBar = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, display: 'flex', flexDirection: 'column', gap: '10px', padding: `8px ${GUTTER} 14px` });
const cluePanel = css({
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '14px',
  padding: '10px 14px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  fontFamily: 'wsClue',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textAlign: 'center',
});
const keyboard = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '7px',
  alignItems: 'stretch',
  width: '100%',
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '18px',
  padding: '9px 10px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  '& button': { flex: 'none', width: 'calc((100% - 45px) / 10)', minWidth: 0 },
});
const keyRow = css({ display: 'flex', gap: '5px', justifyContent: 'center' });
const key = css({
  height: '46px',
  borderRadius: '10px',
  border: 'none',
  fontFamily: 'wsUi',
  fontSize: '18px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  bgImage: 'linear-gradient(180deg, #FBFAF3, #EFEADB)',
  boxShadow: '0 2px 0 0 #DCD6C5, 0 2px 4px -2px rgba(33,75,64,0.2)',
  cursor: 'pointer',
  _active: { transform: 'translateY(1px)', boxShadow: 'inset 0 1px 2px rgba(33,75,64,0.18)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraDark)', outlineOffset: '2px' },
});

function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

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

  // Inbound remote writes land directly on the uncontrolled inputs (ADR-0002 §4),
  // never re-emitting `onCellChange`. Stable subscription; the registrar replays nothing.
  useEffect(() => {
    const unsubscribe = subscribeToRemoteCellUpdates((event) => {
      if (event.type !== 'cellUpdated') return;
      nav.applyRemoteCellUpdate(event.row, event.column, event.letter);
    });
    return unsubscribe;
  }, [subscribeToRemoteCellUpdates, nav]);

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

  // Announce "grille résolue" once on completion (join/leave + mot validé are
  // announced inside useLobbyConnection; this closes the ADR-0050 multi list).
  const announcer = useAnnouncer();
  const announcedSolvedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !announcedSolvedRef.current) {
      announcedSolvedRef.current = true;
      announcer.say('Grille résolue !');
    }
  }, [isCompleted, announcer]);

  const clue = nav.currentClue;
  const clueText = clue
    ? `${clue.clue.text} · ${(nav.currentClueIndex ?? 0) + 1}/${clue.cells.length}`
    : null;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      nav.handleKeyDown(e);
    },
    [nav],
  );

  return (
    <main className={shell} lang="fr">
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

      <PanZoom ref={pzRef} className={viewportFill} contentWidth={BOARD_W} contentHeight={BOARD_H} fit="height" framePad={14} padTop={104} padBottom={bottomInset + BOARD_BOTTOM_GAP} padX={14} maxScale={2.6} edgeFade>
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
        {clueText ? <p className={cluePanel} role="status">{clueText}</p> : null}
        {!isCompleted ? (
          <div className={keyboard}>
            {KEY_ROWS.map((rowKeys, r) => (
              <div key={r} className={keyRow}>
                {rowKeys.map((l) => (
                  <button key={l} type="button" className={key} onClick={() => nav.enterLetter(l)} aria-label={l}>
                    {l}
                  </button>
                ))}
                {r === KEY_ROWS.length - 1 ? (
                  <button type="button" className={cx(key, css({ width: 'calc((100% - 45px) / 10 * 2 + 5px) !important' }))} onClick={() => nav.eraseLetter()} aria-label="Effacer">
                    ⌫
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
