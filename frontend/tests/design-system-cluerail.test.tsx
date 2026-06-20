import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClueRail } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('ClueRail', () => {
  it('shows the clue + counter and fires steppers', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <ClueRail direction="horizontal" clue="Capitale de la France" index={4} total={18} onPrev={onPrev} onNext={onNext} />,
    );
    expect(screen.getByText('Capitale de la France')).toBeTruthy();
    expect(screen.getByText('4 / 18')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Indice suivant'));
    expect(onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText('Indice précédent'));
    expect(onPrev).toHaveBeenCalledOnce();
    await expectAxeClean(container);
  });

  it('disables prev on the first clue and next on the last', () => {
    render(<ClueRail direction="vertical" clue="Note" index={1} total={1} />);
    expect((screen.getByLabelText('Indice précédent') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Indice suivant') as HTMLButtonElement).disabled).toBe(true);
  });
});
