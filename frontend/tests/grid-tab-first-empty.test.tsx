import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Puzzle } from '@/domain';
import { Grid } from '@/ui/components/grid';

// 5x4 grid: across-1 (0,1); across-2 (1,1)-(1,4); down-1 (1,2),(2,2),(3,2). Tab order (across before down, by start row,col): across-1 -> across-2 -> down-1.
const L = (row: number, col: number): Cell => ({ kind: 'letter', position: { row, col }, entry: '' });
const PUZZLE: Puzzle = {
  id: 't', title: 't', language: 'fr', width: 5, height: 4, hintsAllowed: 3, hintsRemaining: 3,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'across-1', arrow: 'right' }] },
    L(0, 1),
    { kind: 'definition', position: { row: 0, col: 2 }, clues: [{ text: 'down-1', arrow: 'down' }] },
    L(0, 3), L(0, 4),
    { kind: 'definition', position: { row: 1, col: 0 }, clues: [{ text: 'across-2', arrow: 'right' }] },
    L(1, 1), L(1, 2), L(1, 3), L(1, 4),
    L(2, 0), L(2, 1), L(2, 2), L(2, 3), L(2, 4),
    L(3, 0),
    { kind: 'block', position: { row: 3, col: 1 } },
    L(3, 2), L(3, 3), L(3, 4),
  ],
};

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
const click = (el: HTMLElement) => { el.focus(); fireEvent.click(el); };
const typeChar = (el: HTMLInputElement, ch: string) => fireEvent.keyDown(el, { key: ch });

describe('Tab/Enter word cycling lands on the first empty cell', () => {
  it('Tab lands on the first empty cell of the next word (skipping a filled leading cell)', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    // Pre-fill (1,1), the first cell of across-2.
    const first = inputAt(container, 1, 1)!;
    click(first);
    typeChar(first, 'a');
    expect(first.value).toBe('A');
    // Focus across-1, then Tab to across-2.
    click(inputAt(container, 0, 1)!);
    fireEvent.keyDown(inputAt(container, 0, 1)!, { key: 'Tab' });
    // (1,1) is filled, so focus lands on the first empty cell (1,2).
    expect(document.activeElement).toBe(inputAt(container, 1, 2));
  });

  it('Tab lands on the first cell when the whole target word is already filled', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    // Fill all of across-2: (1,1),(1,2),(1,3),(1,4).
    click(inputAt(container, 1, 1)!);
    typeChar(inputAt(container, 1, 1)!, 'a');
    typeChar(inputAt(container, 1, 2)!, 'b');
    typeChar(inputAt(container, 1, 3)!, 'c');
    typeChar(inputAt(container, 1, 4)!, 'd');
    // Focus across-1, then Tab to the now-full across-2.
    click(inputAt(container, 0, 1)!);
    fireEvent.keyDown(inputAt(container, 0, 1)!, { key: 'Tab' });
    // No empty cell → fall back to the word's first cell (1,1).
    expect(document.activeElement).toBe(inputAt(container, 1, 1));
  });

  it('Tab still lands on the first cell when the target word is entirely empty', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    click(inputAt(container, 0, 1)!);
    fireEvent.keyDown(inputAt(container, 0, 1)!, { key: 'Tab' });
    // across-2 is empty → first empty cell is its first cell (1,1).
    expect(document.activeElement).toBe(inputAt(container, 1, 1));
  });
});
