import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DefCell } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('DefCell', () => {
  it('renders single and split clue cells', async () => {
    const { container, rerender } = render(<DefCell clues={['Petit oiseau']} arrow="right" />);
    expect(container.querySelector('[data-defcell="single"]')?.textContent).toContain('Petit oiseau');
    await expectAxeClean(container);
    rerender(<DefCell clues={['Sud', 'Oui']} />);
    const split = container.querySelector('[data-defcell="split"]');
    expect(split?.textContent).toContain('Sud');
    expect(split?.textContent).toContain('Oui');
    await expectAxeClean(container);
  });

  it('marks the active clue cell', async () => {
    const { container } = render(<DefCell clues={['Arbre']} active />);
    expect(container.querySelector('[data-defcell="single"]')).not.toBeNull();
    await expectAxeClean(container);
  });
});
