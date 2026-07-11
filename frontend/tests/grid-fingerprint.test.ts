import { describe, expect, it } from 'vitest';
import { gridFingerprint } from '@/domain/puzzle/gridFingerprint';
import type { Cell } from '@/domain/puzzle/Cell';

const letter = (row: number, col: number): Cell => ({ kind: 'letter', position: { row, col }, entry: '' });
const block = (row: number, col: number): Cell => ({ kind: 'block', position: { row, col } });
const def = (row: number, col: number, text: string, arrow: 'right' | 'down' = 'right'): Cell => ({
  kind: 'definition',
  position: { row, col },
  clues: [{ text, arrow }],
});

const base = () => ({
  width: 3,
  height: 2,
  cells: [def(0, 0, 'Capitale'), letter(0, 1), letter(0, 2), block(1, 0), letter(1, 1), letter(1, 2)],
});

describe('gridFingerprint', () => {
  it('is stable for the same structure', () => {
    expect(gridFingerprint(base())).toBe(gridFingerprint(base()));
  });

  it('is independent of cell array order', () => {
    const shuffled = { ...base(), cells: [...base().cells].reverse() };
    expect(gridFingerprint(shuffled)).toBe(gridFingerprint(base()));
  });

  it('ignores typed letters (entry) so it is stable as the player fills cells', () => {
    const filled = {
      ...base(),
      cells: base().cells.map((c) => (c.kind === 'letter' ? { ...c, entry: 'A' } : c)),
    };
    expect(gridFingerprint(filled)).toBe(gridFingerprint(base()));
  });

  it('changes when a cell kind changes at a position', () => {
    const swapped = { ...base(), cells: [...base().cells.slice(1), block(0, 0)] };
    expect(gridFingerprint(swapped)).not.toBe(gridFingerprint(base()));
  });

  it('changes when a definition clue text changes (regenerated grid, same layout)', () => {
    const reclued = {
      ...base(),
      cells: base().cells.map((c) => (c.kind === 'definition' ? def(0, 0, 'Couleur') : c)),
    };
    expect(gridFingerprint(reclued)).not.toBe(gridFingerprint(base()));
  });

  it('changes when a clue arrow changes', () => {
    const rearrowed = {
      ...base(),
      cells: base().cells.map((c) => (c.kind === 'definition' ? def(0, 0, 'Capitale', 'down') : c)),
    };
    expect(gridFingerprint(rearrowed)).not.toBe(gridFingerprint(base()));
  });

  it('changes when the grid dimensions change', () => {
    expect(gridFingerprint({ ...base(), width: 4 })).not.toBe(gridFingerprint(base()));
  });
});
