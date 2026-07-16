import { describe, expect, it } from 'vitest';
import { relativeTimeFr } from '@/ui/lib/relativeTimeFr';

const now = new Date('2026-07-16T12:00:00Z');

describe('relativeTimeFr', () => {
  it('reads "à l\'instant" under a minute', () => {
    expect(relativeTimeFr('2026-07-16T11:59:30Z', now)).toBe("à l'instant");
  });

  it('reads minutes under an hour', () => {
    expect(relativeTimeFr('2026-07-16T11:55:00Z', now)).toBe('il y a 5 min');
  });

  it('reads hours under a day', () => {
    expect(relativeTimeFr('2026-07-16T09:00:00Z', now)).toBe('il y a 3 h');
  });

  it('reads "hier" at one day', () => {
    expect(relativeTimeFr('2026-07-15T11:00:00Z', now)).toBe('hier');
  });

  it('reads days under a week', () => {
    expect(relativeTimeFr('2026-07-13T12:00:00Z', now)).toBe('il y a 3 j');
  });

  it('falls back to the absolute date beyond a week', () => {
    expect(relativeTimeFr('2026-07-06T12:00:00Z', now)).toMatch(/juillet/);
  });
});
