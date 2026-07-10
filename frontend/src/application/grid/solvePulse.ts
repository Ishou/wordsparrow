// One accelerando-to-climax cadence for the solve celebration, shared so the audio
// adapter (infrastructure) and the flatten-ripple (ui) stay locked — replacing the
// old linear SOLVE_STAGGER_MS that each mirrored by hand. Timing only; pitch/gain
// live in the audio adapter. Tuned interactively ("Balanced"): a rising build whose
// gaps ease from startGap→endGap, then a breath, then the climax lands.

export const SOLVE_PULSE = {
  startGapMs: 115, // G0 — the first, slowest gap
  endGapMs: 34, // the fastest gap the build collapses toward
  accel: 0.6, // 0 steady … 1 strong; how late the gaps collapse
  maxSteps: 18, // cap the build so a full-grid sweep stays snappy (and the audio uncrowded)
  preClimaxMs: 90, // breath after the build before the climax lands
  climaxMs: 420, // climax length
} as const;

// Start time (ms) of each build step; length = min(count, maxSteps). Gaps ease
// startGap→endGap shaped by `accel`, so the run accelerates into the climax.
export function solvePulseStepStarts(count: number): number[] {
  const n = Math.max(1, Math.min(Math.floor(count), SOLVE_PULSE.maxSteps));
  const { startGapMs: g0, endGapMs: gMin, accel } = SOLVE_PULSE;
  const starts: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    starts.push(t);
    const shaped = Math.pow((i + 1) / n, 1 + accel * 2);
    t += Math.max(gMin, g0 + (gMin - g0) * shaped);
  }
  return starts;
}

// When the climax lands (ms from the start of the celebration).
export function solvePulseClimaxAtMs(count: number): number {
  const starts = solvePulseStepStarts(count);
  return starts[starts.length - 1] + SOLVE_PULSE.preClimaxMs;
}

// Per-cell ripple delay (ms): cell i of `count` maps onto the capped step timeline, so a
// sweep wider than maxSteps cascades several cells per step yet still accelerates and lands
// its climax at the same instant as the audio.
export function solvePulseCellDelaysMs(count: number): number[] {
  const steps = solvePulseStepStarts(count);
  const n = Math.max(1, Math.floor(count));
  const delays: number[] = [];
  for (let i = 0; i < n; i++) {
    const step = Math.min(steps.length - 1, Math.floor((i * steps.length) / n));
    delays.push(steps[step]);
  }
  return delays;
}

// 0 for a short word … 1 for a full-grid sweep — scales the climax so completing a
// 3-letter word stays gentle while a whole-grid solve gets the full landing.
export function solvePulseClimaxStrength(count: number): number {
  const lo = 4;
  const hi = 24;
  return Math.max(0, Math.min(1, (count - lo) / (hi - lo)));
}
