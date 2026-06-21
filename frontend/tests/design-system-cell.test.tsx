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
});
