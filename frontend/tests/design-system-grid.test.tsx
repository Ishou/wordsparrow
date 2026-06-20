import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Grid } from '@/design-system';
import type { GridLayout } from '@/design-system/components/Grid/layout';
import { expectAxeClean } from '@/test/a11y';

const layout: GridLayout = {
  columns: 5,
  cells: [
    { kind: 'def', clues: ['Capitale de la France'], arrow: 'right' },
    { kind: 'letter', letter: 'P', active: true },
    { kind: 'letter', letter: 'A', active: true },
    { kind: 'letter', letter: 'R', active: true },
    { kind: 'letter', letter: 'I', active: true },
    { kind: 'empty' },
    { kind: 'letter', letter: 'M' },
    { kind: 'def', clues: ['Sud', 'Oui'] },
    { kind: 'letter', letter: 'É' },
    { kind: 'empty' },
  ],
};

describe('Grid', () => {
  it('renders full and mini boards from a layout', async () => {
    const { container, rerender } = render(<Grid layout={layout} size="full" />);
    expect(container.querySelector('[data-grid-size="full"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-cell-state]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-defcell]')).toHaveLength(2);
    rerender(<Grid layout={layout} size="mini" />);
    expect(container.querySelector('[data-grid-size="mini"]')).not.toBeNull();
    await expectAxeClean(container);
  });
});
