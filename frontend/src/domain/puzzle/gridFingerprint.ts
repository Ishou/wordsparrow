import type { Cell } from './Cell';
import type { Puzzle } from './Puzzle';

// Structural signature of a grid, stable while the player types; changes on regeneration (ADR-0105).
export function gridFingerprint(
  puzzle: Pick<Puzzle, 'width' | 'height' | 'cells'>,
): string {
  const ordered = [...puzzle.cells].sort(
    (a, b) => a.position.row - b.position.row || a.position.col - b.position.col,
  );
  const canonical = [`${puzzle.width}x${puzzle.height}`, ...ordered.map(cellSignature)].join('\n');
  // Two independent 32-bit rolls concatenated ⇒ ~64-bit digest; collision here would let a stale blob survive, so keep it wide.
  return `${roll(canonical, 5381)}${roll(canonical, 63689)}`;
}

// Answer letters (LetterCell.entry) are deliberately excluded — they mutate as the player types.
function cellSignature(cell: Cell): string {
  const { row, col } = cell.position;
  if (cell.kind === 'definition') {
    const clues = cell.clues
      .map((c) => `${c.arrow}:${c.text}:${(c.separators ?? []).join(',')}`)
      .join('|');
    return `${row},${col},d,${clues}`;
  }
  return `${row},${col},${cell.kind === 'letter' ? 'l' : 'b'}`;
}

function roll(input: string, seed: number): string {
  let h = seed;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}
