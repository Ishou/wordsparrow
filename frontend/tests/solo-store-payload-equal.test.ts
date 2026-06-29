import { describe, expect, it } from 'vitest';
import { payloadsEqual, type SoloStorePayload } from '@/application/progress';

function payload(p: Partial<SoloStorePayload>): SoloStorePayload {
  return { entries: [], lockedCells: [], hintsUsed: 0, elapsedSeconds: 0, ...p };
}

describe('payloadsEqual', () => {
  it('treats two empty payloads as equal', () => {
    expect(payloadsEqual(payload({}), payload({}))).toBe(true);
  });

  it('ignores entry/lock ordering', () => {
    const a = payload({
      entries: [
        { r: 0, c: 0, l: 'A' },
        { r: 1, c: 1, l: 'B' },
      ],
      lockedCells: [
        { r: 0, c: 0 },
        { r: 2, c: 3 },
      ],
    });
    const b = payload({
      entries: [
        { r: 1, c: 1, l: 'B' },
        { r: 0, c: 0, l: 'A' },
      ],
      lockedCells: [
        { r: 2, c: 3 },
        { r: 0, c: 0 },
      ],
    });
    expect(payloadsEqual(a, b)).toBe(true);
  });

  it('detects a differing letter at the same cell', () => {
    const a = payload({ entries: [{ r: 0, c: 0, l: 'A' }] });
    const b = payload({ entries: [{ r: 0, c: 0, l: 'Z' }] });
    expect(payloadsEqual(a, b)).toBe(false);
  });

  it('detects an extra entry', () => {
    const a = payload({ entries: [{ r: 0, c: 0, l: 'A' }] });
    const b = payload({ entries: [{ r: 0, c: 0, l: 'A' }, { r: 1, c: 1, l: 'B' }] });
    expect(payloadsEqual(a, b)).toBe(false);
  });

  it('detects differing scalars (hintsUsed / elapsedSeconds)', () => {
    expect(payloadsEqual(payload({ hintsUsed: 1 }), payload({ hintsUsed: 2 }))).toBe(false);
    expect(payloadsEqual(payload({ elapsedSeconds: 10 }), payload({ elapsedSeconds: 11 }))).toBe(false);
  });
});
