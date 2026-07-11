import { describe, expect, it } from 'vitest';
import { tallyValidatedLetters } from '@/application/game';
import type { SessionId } from '@/domain/game';

const p1 = 'p1' as SessionId;
const p2 = 'p2' as SessionId;

describe('tallyValidatedLetters', () => {
  it('returns an empty map for no locked cells', () => {
    expect(tallyValidatedLetters([]).size).toBe(0);
  });

  it('counts every locked cell against its lockedBy owner', () => {
    const scores = tallyValidatedLetters([{ lockedBy: p1 }, { lockedBy: p1 }, { lockedBy: p1 }]);
    expect(scores.get(p1)).toBe(3);
  });

  it('splits counts across owners (POMME/PUIT crossing → P1=5, P2=3)', () => {
    const locked = [
      ...Array.from({ length: 5 }, () => ({ lockedBy: p1 })),
      ...Array.from({ length: 3 }, () => ({ lockedBy: p2 })),
    ];
    const scores = tallyValidatedLetters(locked);
    expect(scores.get(p1)).toBe(5);
    expect(scores.get(p2)).toBe(3);
  });
});
