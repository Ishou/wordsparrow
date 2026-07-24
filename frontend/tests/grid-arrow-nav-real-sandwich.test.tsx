import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Grid } from '@/ui/components/grid';
import { apiPuzzleToDomain } from '@/infrastructure/api/grid/mapper';
import realDaily from './fixtures/daily-real-sandwich.json';

// Real prod daily whose top row is the reported `.X.X.` pattern: right-down def cells alternating with letters, so every row-0 letter is down-only.
const PUZZLE = apiPuzzleToDomain(realDaily as never);

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
const wrapAt = (root: HTMLElement, row: number, col: number) =>
  inputAt(root, row, col)?.parentElement ?? null;
const defAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLElement>(`[data-cell-kind="definition"][data-row="${row}"][data-col="${col}"]`);
const click = (el: HTMLElement) => { el.focus(); fireEvent.click(el); };

describe('real daily — .X.X. top row (down-only cells)', () => {
  it('clicking a top-row down-only cell highlights its down word', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    click(inputAt(container, 0, 1)!);
    expect(wrapAt(container, 1, 1)?.dataset.inWord).toBe('true');
    expect(defAt(container, 0, 0)?.dataset.currentClue).toBe('true');
  });

  it('ArrowRight from one top-row cell to the next keeps the down word focused', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    click(inputAt(container, 0, 1)!);
    fireEvent.keyDown(inputAt(container, 0, 1)!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputAt(container, 0, 3));
    expect(wrapAt(container, 1, 3)?.dataset.inWord).toBe('true');
    expect(defAt(container, 0, 2)?.dataset.currentClue).toBe('true');
  });

  // The reported break: horizontal focus on across (5,0..5,4), ArrowRight over def (5,5) onto down-only (5,6) [down word (1,6)..(6,6), def (0,6)].
  it('ArrowRight from a horizontal word onto a down-only cell focuses the down word', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    // Click (5,4) in the across word — default direction 'across' gives horizontal focus (confirmed via the across highlight below).
    click(inputAt(container, 5, 4)!);
    expect(wrapAt(container, 5, 3)?.dataset.inWord).toBe('true');
    expect(defAt(container, 4, 0)?.dataset.currentClue).toBe('true');
    // Now jump over the def at (5,5) onto the down-only cell (5,6).
    fireEvent.keyDown(inputAt(container, 5, 4)!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputAt(container, 5, 6));
    // The down word must light up; the across word must not.
    expect(wrapAt(container, 6, 6)?.dataset.inWord).toBe('true');
    expect(defAt(container, 0, 6)?.dataset.currentClue).toBe('true');
    expect(defAt(container, 4, 0)?.dataset.currentClue).toBe('false');
  });
});
