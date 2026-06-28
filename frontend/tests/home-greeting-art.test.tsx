import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HomeGreetingArt,
  bucketForHour,
  greetingForBucket,
  moonPhase,
  type DayBucket,
} from '@/ui/home/HomeGreetingArt';
import { expectAxeClean } from '@/test/a11y';

describe('bucketForHour', () => {
  const cases: ReadonlyArray<readonly [number, DayBucket]> = [
    [0, 'nuit'],
    [4, 'nuit'],
    [5, 'matin'],
    [11, 'matin'],
    [12, 'apresMidi'],
    [17, 'apresMidi'],
    [18, 'soir'],
    [21, 'soir'],
    [22, 'nuit'],
    [23, 'nuit'],
  ];
  it.each(cases)('maps hour %i to %s', (hour, bucket) => {
    expect(bucketForHour(hour)).toBe(bucket);
  });
});

describe('greetingForBucket', () => {
  it('uses tutoiement and carries no emoji in the heading', () => {
    for (const bucket of ['matin', 'apresMidi', 'soir', 'nuit'] as const) {
      const { hi, sub } = greetingForBucket(bucket);
      // No emoji in the accessible name (the illustration is decorative).
      expect(/\p{Extended_Pictographic}/u.test(hi)).toBe(false);
      expect(/\bvous\b/i.test(`${hi} ${sub}`)).toBe(false);
    }
  });

  it('unifies late night as "Encore debout ?"', () => {
    expect(greetingForBucket('nuit').hi).toBe('Encore debout ?');
  });
});

describe('moonPhase', () => {
  it('is deterministic and in [0,1)', () => {
    const d = new Date(Date.UTC(2026, 5, 26, 12, 0, 0));
    const p = moonPhase(d);
    expect(p).toBe(moonPhase(d));
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });

  it('is near new at the known reference epoch', () => {
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 5);
  });
});

describe('HomeGreetingArt', () => {
  it('renders a decorative (aria-hidden) banner with the shared bough', () => {
    const now = new Date(Date.UTC(2026, 5, 26, 9, 0, 0));
    const { container } = render(<HomeGreetingArt bucket="matin" now={now} />);
    const banner = container.querySelector('[aria-hidden="true"]');
    expect(banner).toBeTruthy();
    expect(container.querySelector('svg use')).toBeTruthy();
  });

  it('omits sun/moon/stars when neutral, regardless of bucket', () => {
    const now = new Date(Date.UTC(2026, 5, 26, 23, 0, 0));
    const neutral = render(<HomeGreetingArt bucket="nuit" now={now} neutral />);
    const real = render(<HomeGreetingArt bucket="nuit" now={now} />);
    // Neutral keeps only the shared foliage <use>; the celestial group renders nothing.
    expect(neutral.container.querySelectorAll('svg > g > *').length).toBe(0);
    expect(real.container.querySelectorAll('svg > g > *').length).toBeGreaterThan(0);
  });

  it('draws stars only at night', () => {
    const now = new Date(Date.UTC(2026, 5, 26, 23, 0, 0));
    const night = render(<HomeGreetingArt bucket="nuit" now={now} />);
    const day = render(<HomeGreetingArt bucket="matin" now={now} />);
    const nightCircles = night.container.querySelectorAll('svg > g > circle').length;
    const dayCircles = day.container.querySelectorAll('svg > g > circle').length;
    expect(nightCircles).toBeGreaterThan(dayCircles);
  });

  it('is axe-clean (decorative SVG, no accessible content)', async () => {
    const now = new Date(Date.UTC(2026, 5, 26, 9, 0, 0));
    const { container } = render(<HomeGreetingArt bucket="soir" now={now} />);
    await expectAxeClean(container);
  });
});
