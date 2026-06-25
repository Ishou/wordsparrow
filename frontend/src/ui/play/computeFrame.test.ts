import { describe, expect, it } from 'vitest';
import { computeFrame, type FrameInsets, type FrameViewport } from './computeFrame';

// Phone-ish viewport with the two overlay bars + side gutter.
const VP: FrameViewport = { w: 400, h: 740 };
const INSETS: FrameInsets = { top: 68, bottom: 334, x: 14 };
// Clear band: x [14, 386] (w 372), y [68, 406] (h 338).
const MIN = 0.5;

describe('computeFrame', () => {
  it('leaves a clue that already fits and is in view untouched (no motion, no zoom)', () => {
    const r = { x: 50, y: 100, w: 120, h: 56 };
    expect(computeFrame(r, VP, INSETS, 1, MIN, 0, 0)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('never zooms in on a small clue', () => {
    const r = { x: 50, y: 100, w: 60, h: 56 };
    expect(computeFrame(r, VP, INSETS, 1, MIN, 0, 0).scale).toBe(1);
  });

  it('pans minimally (same scale) to bring an off-screen clue into the band', () => {
    const r = { x: 50, y: 100, w: 120, h: 56 };
    // Panned up so the clue sits above the band's top edge.
    const out = computeFrame(r, VP, INSETS, 1, MIN, 0, -80);
    expect(out.scale).toBe(1);
    expect(out.tx).toBe(0); // x already in view → unchanged
    expect(out.ty).toBe(-32); // top edge lands on the band top (68)
    expect(-32 + r.y).toBe(68);
  });

  it('shrinks (zoom-out-only) and centres a clue too big for the current scale', () => {
    const r = { x: 50, y: 50, w: 60, h: 200 };
    const out = computeFrame(r, VP, INSETS, 2, MIN, 0, 0);
    expect(out.scale).toBeCloseTo(1.69, 2); // 338 / 200
    expect(out.scale).toBeLessThan(2); // only shrank
    // h * scale === bandH → vertically centred fills the band
    expect(out.ty + r.y * out.scale).toBeCloseTo(68, 1);
  });

  it('clamps to minScale and pins the definition edge when a clue cannot fit', () => {
    const r = { x: 50, y: 50, w: 60, h: 800 };
    const out = computeFrame(r, VP, INSETS, 1, MIN, 0, 0);
    expect(out.scale).toBe(MIN); // fit would be < min → clamped
    // overflow on y → near edge (def top) pinned to the band top (68)
    expect(out.ty + r.y * out.scale).toBeCloseTo(68, 5);
  });

  it('never returns a scale below minScale or above current', () => {
    const tall = computeFrame({ x: 0, y: 0, w: 60, h: 5000 }, VP, INSETS, 1, MIN, 0, 0);
    expect(tall.scale).toBe(MIN);
    const small = computeFrame({ x: 0, y: 0, w: 60, h: 60 }, VP, INSETS, 0.8, MIN, 0, 0);
    expect(small.scale).toBeLessThanOrEqual(0.8);
  });
});
