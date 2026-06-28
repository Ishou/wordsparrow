import type { Cell, Position, Puzzle } from '@/domain';

// canonical across-then-down ordering — shared by PlayScreen and LiveCoopScreen so the two can't drift

export interface OrderedClue {
  readonly key: string;
  readonly startRow: number;
  readonly startCol: number;
  readonly across: boolean;
  readonly text: string;
  readonly cells: Position[];
}

function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function orderClues(puzzle: Puzzle): OrderedClue[] {
  const byPos = new Map<string, Cell>();
  for (const c of puzzle.cells) byPos.set(posKey(c.position.row, c.position.col), c);

  const list: OrderedClue[] = [];
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
      list.push({
        key: `${cell.position.row}:${cell.position.col}:${a}`,
        startRow: cell.position.row + startDr,
        startCol: cell.position.col + startDc,
        across,
        text: clue.text,
        cells,
      });
    }
  }
  list.sort((x, y) => x.startRow - y.startRow || x.startCol - y.startCol || (x.across === y.across ? 0 : x.across ? -1 : 1));
  return list;
}
