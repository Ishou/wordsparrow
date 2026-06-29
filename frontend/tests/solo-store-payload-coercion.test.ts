import { describe, expect, it } from 'vitest';
import { coerceSoloStorePayload } from '@/application/progress/SoloStorePayload';

describe('coerceSoloStorePayload — elapsedSeconds (backward-compatible)', () => {
  it('defaults to 0 when the field is missing (old blobs)', () => {
    expect(
      coerceSoloStorePayload({ entries: [], lockedCells: [], hintsUsed: 0 }).elapsedSeconds,
    ).toBe(0);
  });

  it('preserves a valid finite non-negative number', () => {
    expect(coerceSoloStorePayload({ elapsedSeconds: 240 }).elapsedSeconds).toBe(240);
  });

  it('coerces a negative value to 0', () => {
    expect(coerceSoloStorePayload({ elapsedSeconds: -7 }).elapsedSeconds).toBe(0);
  });

  it('coerces NaN / non-finite to 0', () => {
    expect(coerceSoloStorePayload({ elapsedSeconds: Number.NaN }).elapsedSeconds).toBe(0);
    expect(coerceSoloStorePayload({ elapsedSeconds: Infinity }).elapsedSeconds).toBe(0);
  });

  it('coerces a non-number to 0', () => {
    expect(coerceSoloStorePayload({ elapsedSeconds: '60' }).elapsedSeconds).toBe(0);
  });
});
