import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cell } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('Cell', () => {
  it('renders solved and active letters and never shows a letter when empty', async () => {
    const { container, rerender } = render(<Cell state="solved" letter="A" />);
    expect(container.querySelector('[data-cell-state="solved"]')?.textContent).toBe('A');
    await expectAxeClean(container);
    rerender(<Cell state="active" letter="R" />);
    expect(container.querySelector('[data-cell-state="active"]')?.textContent).toBe('R');
    await expectAxeClean(container);
    rerender(<Cell state="activeWord" letter="A" />);
    expect(container.querySelector('[data-cell-state="activeWord"]')?.textContent).toBe('A');
    await expectAxeClean(container);
    rerender(<Cell state="empty" letter="X" />);
    expect(container.querySelector('[data-cell-state="empty"]')?.textContent).toBe('');
    await expectAxeClean(container);
  });

  it('layers a selection outline only on a solved + selected cell', async () => {
    const { container, rerender } = render(<Cell state="solved" letter="A" selected />);
    const solved = container.querySelector('[data-cell-state="solved"]');
    expect(solved?.getAttribute('data-selected')).toBe('true');
    await expectAxeClean(container);

    // Gated on 'solved': active/word cells already carry the pink selection, so `selected` is inert there.
    rerender(<Cell state="active" letter="R" selected />);
    expect(container.querySelector('[data-cell-state="active"]')?.getAttribute('data-selected')).toBeNull();

    // Solved but not selected → no outline attribute.
    rerender(<Cell state="solved" letter="A" />);
    expect(container.querySelector('[data-cell-state="solved"]')?.getAttribute('data-selected')).toBeNull();
  });
});
