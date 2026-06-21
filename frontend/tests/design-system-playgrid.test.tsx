import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayGrid, DAILY_BOARD } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('PlayGrid', () => {
  it('renders the daily board with a cursor cell, an active word and clue cells', async () => {
    const { container } = render(<PlayGrid />);
    expect(container.querySelector('[aria-label="Grille de mots fléchés en cours"]')).not.toBeNull();
    expect(container.querySelector('[data-cell-state="active"]')?.textContent).toBe('P');
    expect(container.querySelectorAll('[data-cell-state="activeWord"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-defcell]').length).toBeGreaterThan(0);
    await expectAxeClean(container);
  });

  it('exposes the daily board layout as 7 columns', () => {
    expect(DAILY_BOARD.columns).toBe(7);
    expect(DAILY_BOARD.cells.length % DAILY_BOARD.columns).toBe(0);
  });
});
