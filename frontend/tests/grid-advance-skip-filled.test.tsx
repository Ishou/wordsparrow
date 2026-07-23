import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Puzzle } from '@/domain';
import { Grid } from '@/ui/components/grid';

// 5×2 grid: across word "across-2" at (1,1)-(1,4); (1,2) doubles as the first cell of a down word.
const L = (row: number, col: number): Cell => ({ kind: 'letter', position: { row, col }, entry: '' });
const PUZZLE: Puzzle = {
  id: 't', title: 't', language: 'fr', width: 5, height: 2, hintsAllowed: 3, hintsRemaining: 3,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'a1', arrow: 'right' }] },
    L(0, 1),
    { kind: 'definition', position: { row: 0, col: 2 }, clues: [{ text: 'd1', arrow: 'down' }] },
    L(0, 3), L(0, 4),
    { kind: 'definition', position: { row: 1, col: 0 }, clues: [{ text: 'a2', arrow: 'right' }] },
    L(1, 1), L(1, 2), L(1, 3), L(1, 4),
  ],
};

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
const click = (el: HTMLElement) => { el.focus(); fireEvent.click(el); };
const typeChar = (el: HTMLInputElement, ch: string) => fireEvent.keyDown(el, { key: ch });

// Prefill a cell's value directly through the input path, then return focus to `home`.
function prefill(root: HTMLElement, row: number, col: number, ch: string, home: HTMLInputElement) {
  const target = inputAt(root, row, col)!;
  click(target);
  typeChar(target, ch);
  click(home);
}

describe('typing-advance skip-filled', () => {
  it('skip on: hops over a filled cell to the next empty one', () => {
    const { container } = render(<Grid puzzle={PUZZLE} skipFilledOnAdvance={() => true} />);
    const start = inputAt(container, 1, 1)!;
    prefill(container, 1, 2, 'x', start); // (1,2) now filled; focus back on (1,1)
    typeChar(start, 'a');
    expect(start.value).toBe('A');
    // (1,2) filled → cursor skips it and lands on the next empty cell (1,3).
    expect(document.activeElement).toBe(inputAt(container, 1, 3));
  });

  it('skip off (default): lands on the immediate next cell even when filled', () => {
    const { container } = render(<Grid puzzle={PUZZLE} />);
    const start = inputAt(container, 1, 1)!;
    prefill(container, 1, 2, 'x', start);
    typeChar(start, 'a');
    expect(document.activeElement).toBe(inputAt(container, 1, 2));
  });

  it('skip on: falls back to the immediate next cell when all cells ahead are filled', () => {
    const { container } = render(<Grid puzzle={PUZZLE} skipFilledOnAdvance={() => true} />);
    const start = inputAt(container, 1, 1)!;
    prefill(container, 1, 2, 'x', start);
    prefill(container, 1, 3, 'y', start);
    prefill(container, 1, 4, 'z', start);
    typeChar(start, 'a');
    // No empty cell ahead → fall back to the immediate next (1,2).
    expect(document.activeElement).toBe(inputAt(container, 1, 2));
  });

  it('skip on: Android insertText path also skips filled cells', () => {
    const { container } = render(<Grid puzzle={PUZZLE} skipFilledOnAdvance={() => true} />);
    const start = inputAt(container, 1, 1)!;
    prefill(container, 1, 2, 'x', start);
    start.value = 'a';
    start.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a', bubbles: true }));
    expect(document.activeElement).toBe(inputAt(container, 1, 3));
  });
});
