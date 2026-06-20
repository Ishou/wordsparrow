import { describe, expect, it } from 'vitest';
import { resolveGrid, rowCount, type GridLayout } from '@/design-system/components/Grid/layout';

const layout: GridLayout = {
  columns: 2,
  cells: [
    { kind: 'def', clues: ['Petit oiseau'], arrow: 'right' },
    { kind: 'letter', letter: 'M', active: true },
    { kind: 'empty' },
    { kind: 'letter', letter: 'O' },
  ],
};

describe('resolveGrid', () => {
  it('assigns row/col by reading order', () => {
    const cells = resolveGrid(layout);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toMatchObject({ row: 0, col: 0 });
    expect(cells[1]).toMatchObject({ row: 0, col: 1 });
    expect(cells[2]).toMatchObject({ row: 1, col: 0 });
    expect(cells[3]).toMatchObject({ row: 1, col: 1 });
  });

  it('computes the row count', () => {
    expect(rowCount(layout)).toBe(2);
  });

  it('rejects a ragged layout', () => {
    expect(() => resolveGrid({ columns: 3, cells: [{ kind: 'empty' }, { kind: 'empty' }] })).toThrow(/multiple of columns/);
  });

  it('rejects a zero-column layout', () => {
    expect(() => resolveGrid({ columns: 0, cells: [] })).toThrow(/at least one column/);
  });
});

describe('rowCount', () => {
  it('rejects a ragged layout', () => {
    expect(() => rowCount({ columns: 3, cells: [{ kind: 'empty' }, { kind: 'empty' }] })).toThrow(/multiple of columns/);
  });

  it('rejects a zero-column layout', () => {
    expect(() => rowCount({ columns: 0, cells: [] })).toThrow(/at least one column/);
  });
});
