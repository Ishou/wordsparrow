import { describe, expect, it } from 'vitest';
import {
  SOLVE_PULSE,
  solvePulseCellDelaysMs,
  solvePulseClimaxAtMs,
  solvePulseClimaxStrength,
  solvePulseStepStarts,
} from '@/application/grid/solvePulse';

const gaps = (starts: number[]): number[] => starts.slice(1).map((s, i) => s - starts[i]);

describe('solvePulse', () => {
  it('accelerates: each gap is no larger than the previous one', () => {
    const g = gaps(solvePulseStepStarts(18));
    for (let i = 1; i < g.length; i++) {
      expect(g[i]).toBeLessThanOrEqual(g[i - 1] + 1e-9);
    }
  });

  it('first gap is the slow start, last gap reaches the fast floor', () => {
    const g = gaps(solvePulseStepStarts(18));
    expect(g[0]).toBeCloseTo(SOLVE_PULSE.startGapMs, 0);
    expect(g[g.length - 1]).toBeGreaterThanOrEqual(SOLVE_PULSE.endGapMs - 1e-9);
    expect(g[g.length - 1]).toBeLessThan(SOLVE_PULSE.startGapMs);
  });

  it('caps the build so a full-grid sweep stays bounded', () => {
    expect(solvePulseStepStarts(4).length).toBe(4);
    expect(solvePulseStepStarts(100).length).toBe(SOLVE_PULSE.maxSteps);
    // the timeline for a huge sweep is the same length as the cap
    expect(solvePulseStepStarts(100)).toEqual(solvePulseStepStarts(SOLVE_PULSE.maxSteps));
  });

  it('a wide sweep gets one ripple delay per cell, cascading over the capped timeline', () => {
    const delays = solvePulseCellDelaysMs(50);
    expect(delays.length).toBe(50);
    // non-decreasing, and lands at the last build step
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    const steps = solvePulseStepStarts(50);
    expect(delays[delays.length - 1]).toBe(steps[steps.length - 1]);
  });

  it('the climax lands after the build, past a breath', () => {
    const steps = solvePulseStepStarts(36);
    const buildEnd = steps[steps.length - 1];
    expect(solvePulseClimaxAtMs(36)).toBeCloseTo(buildEnd + SOLVE_PULSE.preClimaxMs, 6);
  });

  it('climax strength scales 0 for a short word to 1 for a full sweep', () => {
    expect(solvePulseClimaxStrength(3)).toBe(0);
    expect(solvePulseClimaxStrength(24)).toBe(1);
    expect(solvePulseClimaxStrength(60)).toBe(1);
    expect(solvePulseClimaxStrength(14)).toBeGreaterThan(0);
    expect(solvePulseClimaxStrength(14)).toBeLessThan(1);
  });
});
