import { css } from 'styled-system/css';
import { CELL, GAP, STRIDE } from './playLayout';
import type { Clue } from './useGridNavigation';

const mark = css({
  position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'fg.muted', fontWeight: 'bold', pointerEvents: 'none', zIndex: 2,
});

// Visual-only: the "mot composé" a11y cue lives on the clue's DefCell accessible name, not here.
export function SeparatorOverlay({ clues }: { clues: readonly Clue[] }) {
  const marks = clues.flatMap((c) =>
    (c.clue.separators ?? []).flatMap((offset) => {
      const prev = c.cells[offset - 1];
      if (!prev) return [];
      const { row, col } = prev.position;
      const horizontal = c.direction === 'across';
      const left = horizontal ? col * STRIDE + CELL : col * STRIDE;
      const top = horizontal ? row * STRIDE : row * STRIDE + CELL;
      const width = horizontal ? GAP : CELL;
      const height = horizontal ? CELL : GAP;
      return [
        <span
          key={`${row},${col},${c.direction}`}
          data-testid="sep-mark"
          aria-hidden="true"
          className={mark}
          style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}
        >
          -
        </span>,
      ];
    }),
  );
  return <>{marks}</>;
}
