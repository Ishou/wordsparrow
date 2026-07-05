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

  it('announces a compound clue in its accessible name, and leaves plain clues alone', async () => {
    const { container, getByRole, queryByRole, rerender } = render(
      <DefCell clues={['Arc-en-ciel']} arrow="right" compoundClues={[true]} />,
    );
    expect(getByRole('group', { name: /arc-en-ciel.*mot composé.*trait d’union/i })).toBeInTheDocument();
    await expectAxeClean(container);

    rerender(<DefCell clues={['Arbre']} arrow="right" />);
    expect(queryByRole('group')).toBeNull();
    expect(container.querySelector('[data-defcell="single"]')?.textContent).toContain('Arbre');
  });

  it('folds the indication into only the compound half of a split cell', async () => {
    const { container, getByRole } = render(
      <DefCell clues={['Sud', 'Porte-clés']} compoundClues={[false, true]} />,
    );
    expect(getByRole('group', { name: /porte-clés.*mot composé/i })).toBeInTheDocument();
    const split = container.querySelector('[data-defcell="split"]');
    expect(split?.textContent).toContain('Sud');
    expect(split?.textContent).toContain('Porte-clés');
    await expectAxeClean(container);
  });
});
