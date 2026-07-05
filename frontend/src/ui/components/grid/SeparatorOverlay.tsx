import { css } from 'styled-system/css';
import { CELL, GAP, STRIDE } from './playLayout';
import type { Clue } from './useGridNavigation';

const slot = css({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  overflow: 'visible',
  // Above the letter cells (boardGrid is zIndex 1) so the bar's overflow into
  // the adjacent cells isn't occluded.
  zIndex: 6,
});

// Gold "trait d'union" chip — miel (secondary) gradient, its own token vocabulary
// distinct from the pink clue arrows; a capsule straddling the two joined cells.
const chip = css({
  // The slot is only GAP-wide on one axis; without this the flex item shrinks to it.
  flexShrink: 0,
  borderRadius: 'full',
  background:
    'linear-gradient(135deg, token(colors.secondary.200) 0%, token(colors.secondary.500) 48%, token(colors.secondary.700) 100%)',
  boxShadow:
    '0 1px 2.5px color-mix(in srgb, token(colors.secondary.800) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.55)',
  border: '0.5px solid token(colors.secondary.700)',
});

// Always a horizontal hyphen bar, regardless of the word's axis.
const CHIP_LONG = 16;
const CHIP_THICK = 6;

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
          className={slot}
          style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}
        >
          <span className={chip} style={{ width: `${CHIP_LONG}px`, height: `${CHIP_THICK}px` }} />
        </span>,
      ];
    }),
  );
  return <>{marks}</>;
}
