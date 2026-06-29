import { describe, it, expect } from 'vitest';
import { formatClock } from '@/ui/play/formatClock';

describe('formatClock', () => {
  it('rolls past 60 minutes into hours instead of a large minute count', () => {
    expect(formatClock(129 * 60 + 47)).toBe('02:09:47');
  });

  it('shows MM:SS under an hour', () => {
    expect(formatClock(9 * 60 + 47)).toBe('09:47');
    expect(formatClock(47)).toBe('00:47');
  });

  it('clamps and floors non-finite or negative input', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(59.9)).toBe('00:59');
  });
});
