import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClueRail } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

const LABELS = {
  directionLabel: 'HORIZONTAL',
  groupLabel: 'Indice actif',
  counterLabel: 'Indice 4 sur 18',
  prevLabel: 'Indice précédent',
  nextLabel: 'Indice suivant',
  zoomInLabel: 'Zoomer',
  zoomOutLabel: 'Dézoomer',
};

describe('ClueRail', () => {
  it('shows the clue + counter and fires steppers', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <ClueRail {...LABELS} direction="horizontal" clue="Capitale de la France" index={4} total={18} onPrev={onPrev} onNext={onNext} />,
    );
    expect(screen.getByText('Capitale de la France')).toBeTruthy();
    expect(screen.getByText('4 / 18')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Indice suivant'));
    expect(onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText('Indice précédent'));
    expect(onPrev).toHaveBeenCalledOnce();
    await expectAxeClean(container);
  });

  it('disables both steppers when there is a single clue', () => {
    render(<ClueRail {...LABELS} direction="vertical" clue="Note" index={1} total={1} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect((screen.getByLabelText('Indice précédent') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Indice suivant') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps both steppers enabled at the bounds so they cycle', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    // First clue: prev must still fire (wraps to the last) — not disabled.
    const { rerender } = render(<ClueRail {...LABELS} direction="vertical" clue="A" index={1} total={18} onPrev={onPrev} onNext={onNext} />);
    expect((screen.getByLabelText('Indice précédent') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Indice précédent'));
    expect(onPrev).toHaveBeenCalledOnce();
    // Last clue: next must still fire (wraps to the first).
    rerender(<ClueRail {...LABELS} direction="vertical" clue="A" index={18} total={18} onPrev={onPrev} onNext={onNext} />);
    expect((screen.getByLabelText('Indice suivant') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Indice suivant'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows the word length as "(N)" with a spoken label when letterCount is set', async () => {
    const { container } = render(
      <ClueRail {...LABELS} direction="horizontal" clue="Capitale de la France" index={4} total={18} letterCount={5} letterCountLabel="5 lettres" onPrev={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText('(5)')).toBeTruthy();
    // The glyph is decorative; the spoken form carries the meaning.
    expect(screen.getByText('5 lettres')).toBeTruthy();
    await expectAxeClean(container);
  });

  it('omits the count when letterCount is not provided', () => {
    render(<ClueRail {...LABELS} direction="horizontal" clue="Capitale de la France" index={4} total={18} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByText(/^\(\d+\)$/)).toBeNull();
  });
});
