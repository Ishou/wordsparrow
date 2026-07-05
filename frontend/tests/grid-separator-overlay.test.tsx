import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { SeparatorOverlay } from '@/ui/components/grid/SeparatorOverlay';
import { CELL, STRIDE } from '@/ui/components/grid/playLayout';

describe('SeparatorOverlay', () => {
  test('renders a hyphen at each across separator offset', () => {
    const clue = {
      direction: 'across' as const,
      clue: { text: 'x', arrow: 'right' as const, separators: [3, 5] },
      cells: Array.from({ length: 9 }, (_, i) => ({
        kind: 'letter' as const, position: { row: 2, col: i + 1 }, entry: '',
      })),
      definition: { kind: 'definition' as const, position: { row: 2, col: 0 }, clues: [] as never },
    };
    const { getAllByTestId } = render(<SeparatorOverlay clues={[clue]} />);
    const marks = getAllByTestId('sep-mark');
    expect(marks).toHaveLength(2);
    // First hyphen sits after cell index 2 (col 3): left = 3*STRIDE + ... anchored to the gap.
    expect(marks[0]).toHaveStyle({ left: `${(1 + 3 - 1) * STRIDE + CELL}px` });
  });

  // The "mot composé" a11y indication lives on DefCell's accessible name (design-system-defcell.test.tsx).
});
