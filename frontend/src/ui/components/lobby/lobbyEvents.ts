import type { GameEvent } from '@/application/game';
import type {
  ArrowDirection,
  Cell,
  DefinitionClue,
  Puzzle,
} from '@/domain';
import type {
  GameArrowDirection,
  GameCell,
  GameDefinitionCell,
  GamePuzzle,
} from '@/domain/game';

// Adapter from the wire-shape `GamePuzzle` (mirrors AsyncAPI) to the
// UI-shape `Puzzle` consumed by `Grid`. The two shapes belong to
// distinct bounded contexts (game/ vs puzzle/) and do not share a
// physical type by design — the wire format is dictated by
// `game/api/asyncapi.yaml` and renaming it would break the contract.
export function gamePuzzleToPuzzle(gamePuzzle: GamePuzzle): Puzzle {
  // Definition cells in `GamePuzzle` carry exactly one clue (one
  // `text` + one `arrow`). The UI `DefinitionCell` shape allows one or
  // two; we always emit a single-element tuple, which matches the
  // existing v1 grid renderer for non-stacked clues.
  const cells: Cell[] = gamePuzzle.cells.map((cell) => gameCellToCell(cell));
  return {
    id: gamePuzzle.id,
    title: gamePuzzle.title,
    language: gamePuzzle.language,
    width: gamePuzzle.width,
    height: gamePuzzle.height,
    hintsAllowed: gamePuzzle.hintsAllowed,
    hintsRemaining: gamePuzzle.hintsAllowed,
    cells,
  };
}

function gameCellToCell(cell: GameCell): Cell {
  const position = { row: cell.position.row, col: cell.position.column };
  switch (cell.kind) {
    case 'letter':
      // `entry` is the player's local input — ALWAYS empty on first paint
      // of a freshly-started game. The wire's `letter` field is the
      // server's blank/pre-fill slot, NOT the canonical solution: per
      // game/api/asyncapi.yaml `GameLetterCell`, the server sends `null`
      // here in v1 precisely because the answer is domain-private until
      // `gameSolved`. Routing `letter` into `entry` here was the original
      // bug — keep this defensive even if a future server starts sending
      // a pre-filled hint, because that hint is still NOT the player's
      // own input.
      return { kind: 'letter', position, entry: '' };
    case 'definition':
      return definitionCellToCell(cell, position);
    case 'block':
      return { kind: 'block', position };
  }
}

// `GameDefinitionCell` carries 1 or 2 clues per game/api/asyncapi.yaml's
// `clues` array (mots-fléchés corner-cell idiom: an across clue and a down
// clue stacked at the same position). The UI `DefinitionCell` accepts either
// shape via its `[clue]` / `[clue, clue]` tuple, so we pass the wire order
// straight through; the renderer in `Cell.tsx` re-orders for visual layout
// without touching domain order — see ADR-0005 §3a.
function definitionCellToCell(
  cell: GameDefinitionCell,
  position: { row: number; col: number },
): Cell {
  const [first, second] = cell.clues;
  const clue0: DefinitionClue = { text: first.text, arrow: gameArrowToArrow(first.arrow) };
  const clues: readonly [DefinitionClue] | readonly [DefinitionClue, DefinitionClue] = second
    ? [clue0, { text: second.text, arrow: gameArrowToArrow(second.arrow) }]
    : [clue0];
  return { kind: 'definition', position, clues };
}

// `GameArrowDirection` and `ArrowDirection` enumerate the exact same four
// labels (per asyncapi.yaml & ADR-0005 §3a). The cast is a no-op at
// runtime; the explicit map surfaces a TS error if either union drifts.
function gameArrowToArrow(arrow: GameArrowDirection): ArrowDirection {
  switch (arrow) {
    case 'right': return 'right';
    case 'down': return 'down';
    case 'down-right': return 'down-right';
    case 'right-down': return 'right-down';
  }
}

export interface MultiAnnounceContext {
  readonly localSessionId: string;
  readonly pseudonymBySessionId: ReadonlyMap<string, string>;
  // Reads the player's letter at (row, col) — '' when empty. Defaults
  // to a DOM query (ADR-0002 §4: cell values live in the DOM).
  readonly readLetterAt?: (row: number, col: number) => string;
}

// Map a `GameEvent` to a polite SR announcement, or `null` when no
// announcement is appropriate (local user's own join/leave; events that
// don't carry a meaningful SR signal).
export function multiAnnouncementFor(
  event: GameEvent,
  ctx: MultiAnnounceContext,
): string | null {
  const read =
    ctx.readLetterAt ??
    ((row, col) => {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`,
      );
      return input?.value ?? '';
    });

  switch (event.type) {
    case 'playerJoined': {
      if (event.sessionId === ctx.localSessionId) return null;
      return `${event.pseudonym} a rejoint la partie`;
    }
    case 'playerLeft': {
      if (event.sessionId === ctx.localSessionId) return null;
      const name = ctx.pseudonymBySessionId.get(event.sessionId) ?? 'Un joueur';
      return `${name} a quitté la partie`;
    }
    case 'gameStarted': {
      return 'La partie commence';
    }
    case 'wordLocked': {
      const word = event.positions
        .map((p) => read(p.row, p.column))
        .join('');
      if (word.length === 0) return null;
      return `mot validé : ${word}`;
    }
    default:
      return null;
  }
}
