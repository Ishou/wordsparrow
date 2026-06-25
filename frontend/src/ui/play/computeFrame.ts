// Pure framing geometry; unit tests in computeFrame.test.ts document the contract.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface FrameViewport {
  readonly w: number;
  readonly h: number;
}
// Clear band insets: the overlay bars (top header, bottom keyboard) and the
// left/right pan gutter. The band is [x, w-x] × [top, h-bottom].
export interface FrameInsets {
  readonly top: number;
  readonly bottom: number;
  readonly x: number;
}
export interface FrameResult {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

const EPS = 0.5;

// Pan one axis: bring [r0, r1] (stage-space extent at the target scale) into
// the band [lo, hi]. `center` forces centring (used when we changed zoom);
// otherwise it's a minimal nudge from `current`. When the extent is larger
// than the band (overflow), the rect's near edge is pinned to `lo` so the
// definition end stays visible.
function panAxis(r0: number, r1: number, lo: number, hi: number, current: number, center: boolean): number {
  const extent = r1 - r0;
  const band = hi - lo;
  if (extent > band + EPS) return lo - r0; // overflow: pin near edge (def) to band start
  if (center) return (lo + hi) / 2 - (r0 + r1) / 2;
  if (current + r0 < lo) return lo - r0; // off the near edge → nudge in
  if (current + r1 > hi) return hi - r1; // off the far edge → nudge in
  return current; // already fully inside → no motion
}

export function computeFrame(
  rect: Rect,
  vp: FrameViewport,
  insets: FrameInsets,
  currentScale: number,
  minScale: number,
  currentTx: number,
  currentTy: number,
): FrameResult {
  const left = insets.x;
  const right = vp.w - insets.x;
  const top = insets.top;
  const bottom = vp.h - insets.bottom;
  const bandW = right - left;
  const bandH = bottom - top;

  const fitsAtCurrent = rect.w * currentScale <= bandW + EPS && rect.h * currentScale <= bandH + EPS;
  let scale = currentScale;
  if (!fitsAtCurrent) {
    const fit = Math.min(bandW / rect.w, bandH / rect.h);
    // shrink to fit, but never below minScale and never larger than current.
    scale = Math.max(minScale, Math.min(fit, currentScale));
  }
  const zoomed = scale !== currentScale;

  const tx = panAxis(rect.x * scale, (rect.x + rect.w) * scale, left, right, currentTx, zoomed);
  const ty = panAxis(rect.y * scale, (rect.y + rect.h) * scale, top, bottom, currentTy, zoomed);
  return { scale, tx, ty };
}
