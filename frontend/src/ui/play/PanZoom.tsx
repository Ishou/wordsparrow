import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { css, cx } from 'styled-system/css';
import { computeFrame } from './computeFrame';

export interface PanZoomHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  // Pan so a content-space rect becomes visible (used to follow the cursor).
  reveal: (x: number, y: number, w: number, h: number) => void;
  // Zoom-out + pan so a rect is centred in the clear band, animated (auto-frame).
  frame: (x: number, y: number, w: number, h: number) => void;
}

export interface PanZoomProps {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  // 'cover' fills both axes (bleeds); 'height'/'width' fill one axis; fit scale becomes the zoom floor.
  readonly fit?: 'cover' | 'contain' | 'height' | 'width';
  readonly overscan?: number;
  // Max pan gap (px) past flush: padTop = top-edge gap, padX = left/right-edge gap.
  readonly padTop?: number;
  readonly padBottom?: number;
  readonly padX?: number;
  // Frame inset (px) kept around the board at its fit/floor scale; it bleeds through when zoomed.
  readonly framePad?: number;
  // Soft jade vignette so bleeding edge cells dissolve into the field (fenêtré).
  readonly edgeFade?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
}

// Framing-free: the consumer supplies size + any background via className.
const viewport = css({
  position: 'relative',
  overflow: 'hidden',
  touchAction: 'none',
  cursor: 'grab',
  userSelect: 'none',
  _active: { cursor: 'grabbing' },
});
// No permanent will-change: promote during gesture only so the browser re-paints crisply at rest.
const stage = css({ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0' });
const fade = css({ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit', zIndex: 2 });
// Distance (px) over which a cut-off side edge softens into the field.
const EDGE_FADE_PX = 40;

const TAP_SLOP = 6;
const STEP = 1.25;
// Exponential in normalized scroll distance so mouse notch ≈ trackpad swipe; higher = faster.
const WHEEL_ZOOM_K = 0.003;
const WHEEL_ZOOM_MAX = 0.3; // cap one event at ~±30% so a fast flick can't jump
const PINCH_ZOOM_BOOST = 6; // ctrlKey wheel = trackpad pinch; its deltas are tiny

export const PanZoom = forwardRef<PanZoomHandle, PanZoomProps>(function PanZoom(
  { contentWidth, contentHeight, minScale = 0.5, maxScale = 3, fit = 'contain', overscan = 1.08, padTop = 0, padBottom = 0, padX = 0, framePad = 0, edgeFade = false, className, style, children },
  ref,
) {
  const vpRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const moved = useRef(0);
  const idle = useRef(0);
  const rafId = useRef(0);
  const reduceMotion = useRef(false);
  const frameAnimActive = useRef(false);

  const apply = useCallback(() => {
    if (stRef.current) stRef.current.style.transform = `translate(${tx.current}px, ${ty.current}px) scale(${scale.current})`;
    const vp = vpRef.current;
    if (!edgeFade || !fadeRef.current || !vp) return;
    // Mask overlay uses the jade gradient so it blends on both flat and gradient board backgrounds.
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = contentWidth * scale.current;
    const ch = contentHeight * scale.current;
    const d = EDGE_FADE_PX;
    const masks: string[] = [];
    if (tx.current < -1) masks.push(`linear-gradient(to right, #000, transparent ${d}px)`);
    if (tx.current + cw > vw + 1) masks.push(`linear-gradient(to left, #000, transparent ${d}px)`);
    if (ty.current < -1) masks.push(`linear-gradient(to bottom, #000, transparent ${d}px)`);
    if (ty.current + ch > vh + 1) masks.push(`linear-gradient(to top, #000, transparent ${d}px)`);
    const el = fadeRef.current;
    if (masks.length) {
      const m = masks.join(', ');
      el.style.background = 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)';
      el.style.setProperty('mask-image', m);
      el.style.setProperty('-webkit-mask-image', m);
      el.style.setProperty('mask-composite', 'add');
      el.style.setProperty('-webkit-mask-composite', 'source-over');
    } else {
      el.style.background = 'none';
      el.style.removeProperty('mask-image');
      el.style.removeProperty('-webkit-mask-image');
    }
  }, [contentWidth, contentHeight, edgeFade]);

  // Promote to a GPU layer while gesturing; drop it on settle to re-paint sharp.
  const promote = useCallback(() => {
    if (stRef.current) stRef.current.style.willChange = 'transform';
  }, []);
  const settle = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      if (stRef.current) stRef.current.style.willChange = 'auto';
    }, 180);
  }, []);
  useEffect(() => () => window.clearTimeout(idle.current), []);

  // JS tween (not CSS transition) so the transform and edge-fade always update in lockstep each frame.
  const ANIM_MS = 220;
  const tweenFrame = useCallback((toScale: number, toTx: number, toTy: number) => {
    cancelAnimationFrame(rafId.current);
    const fromScale = scale.current;
    const fromTx = tx.current;
    const fromTy = ty.current;
    if (reduceMotion.current) {
      scale.current = toScale;
      tx.current = toTx;
      ty.current = toTy;
      frameAnimActive.current = false;
      apply();
      return;
    }
    frameAnimActive.current = true;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / ANIM_MS);
      const k = 1 - Math.pow(1 - t, 3); // ease-out
      scale.current = fromScale + (toScale - fromScale) * k;
      tx.current = fromTx + (toTx - fromTx) * k;
      ty.current = fromTy + (toTy - fromTy) * k;
      apply();
      if (t < 1) rafId.current = requestAnimationFrame(tick);
      else frameAnimActive.current = false;
    };
    rafId.current = requestAnimationFrame(tick);
  }, [apply]);
  useEffect(() => () => cancelAnimationFrame(rafId.current), []);
  // Snap viewport scroll to 0: focus triggers a browser scroll that shifts the transform-positioned stage.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onScroll = () => {
      if (vp.scrollLeft !== 0 || vp.scrollTop !== 0) {
        vp.scrollLeft = 0;
        vp.scrollTop = 0;
      }
    };
    vp.addEventListener('scroll', onScroll, { passive: true });
    return () => vp.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.current = mq.matches;
    const onChange = () => { reduceMotion.current = mq.matches; };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // fit fills the viewport; padBottom governs only pan + reveal, not the initial fit.
  const fitScale = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return 1;
    const sx = vp.clientWidth / contentWidth;
    const sy = vp.clientHeight / contentHeight;
    if (fit === 'cover') return Math.max(sx, sy);
    if (fit === 'height') return sy;
    if (fit === 'width') return sx;
    // contain: fit the whole board inside the clear band (viewport minus the pan-insets) so no edge clips.
    return Math.min((vp.clientWidth - 2 * padX) / contentWidth, (vp.clientHeight - padTop - padBottom) / contentHeight);
  }, [contentWidth, contentHeight, fit, padTop, padBottom, padX]);
  // `fit` sets the initial zoom; the floor lets you unzoom back to the whole board.
  const containScale = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return minScale;
    return Math.min((vp.clientWidth - 2 * framePad) / contentWidth, (vp.clientHeight - 2 * framePad) / contentHeight);
  }, [contentWidth, contentHeight, minScale, framePad]);
  const lowerBound = useCallback(() => Math.max(minScale, containScale()), [containScale, minScale]);

  const clamp = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = contentWidth * scale.current;
    const ch = contentHeight * scale.current;
    // pan-insets stop each edge with a gap instead of flush against the viewport.
    tx.current = cw <= vw ? (vw - cw) / 2 : Math.min(padX, Math.max(vw - cw - padX, tx.current));
    // Pan bounded to the clear band between overlay bars; centre when board is shorter than the band.
    const clearTop = padTop;
    const clearBottom = vh - padBottom;
    if (ch > clearBottom - clearTop) ty.current = Math.min(clearTop, Math.max(clearBottom - ch, ty.current));
    else ty.current = clearTop + (clearBottom - clearTop - ch) / 2;
  }, [contentWidth, contentHeight, padTop, padBottom, padX]);

  const zoomTo = useCallback(
    (next: number, cx0: number, cy0: number) => {
      // Ignore zoom while a frame animation owns the view — a mid-animation zoom leaves a stuck tiled layer.
      if (frameAnimActive.current) return;
      const s = Math.min(maxScale, Math.max(lowerBound(), next));
      const k = s / scale.current;
      tx.current = cx0 - (cx0 - tx.current) * k;
      ty.current = cy0 - (cy0 - ty.current) * k;
      scale.current = s;
      clamp();
      apply();
    },
    [apply, clamp, lowerBound, maxScale],
  );

  // Layout effect so the initial fit transform is applied before the browser paints (no unfitted flash).
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (vp) {
      scale.current = fit === 'cover' ? fitScale() * overscan : fitScale();
      // Centre on both axes so whichever side bleeds does so evenly.
      tx.current = (vp.clientWidth - contentWidth * scale.current) / 2;
      ty.current = (vp.clientHeight - contentHeight * scale.current) / 2;
    }
    clamp();
    apply();
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Keep the user's zoom on resize; only nudge it back above the floor.
      if (scale.current < lowerBound()) scale.current = lowerBound();
      clamp();
      apply();
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [apply, clamp, contentWidth, contentHeight, fitScale, fit, overscan, lowerBound]);

  // Wheel must be a non-passive native listener so preventDefault stops page scroll.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      promote();
      const rect = vp.getBoundingClientRect();
      // Normalize to pixels: one notch fires one big delta; trackpad fires a stream of tiny ones.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → px
      else if (e.deltaMode === 2) dy *= vp.clientHeight; // pages → px
      const k = e.ctrlKey ? WHEEL_ZOOM_K * PINCH_ZOOM_BOOST : WHEEL_ZOOM_K;
      const factor = Math.exp(Math.max(-WHEEL_ZOOM_MAX, Math.min(WHEEL_ZOOM_MAX, -dy * k)));
      zoomTo(scale.current * factor, e.clientX - rect.left, e.clientY - rect.top);
      settle();
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [promote, settle, zoomTo]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const vp = vpRef.current;
        if (vp) zoomTo(scale.current * STEP, vp.clientWidth / 2, vp.clientHeight / 2);
      },
      zoomOut: () => {
        const vp = vpRef.current;
        if (vp) zoomTo(scale.current / STEP, vp.clientWidth / 2, vp.clientHeight / 2);
      },
      reveal: (x, y, w, h) => {
        if (frameAnimActive.current) return; // a frame animation owns the view
        const vp = vpRef.current;
        if (!vp) return;
        const m = 14;
        const vw = vp.clientWidth;
        const vh = vp.clientHeight;
        const left = tx.current + x * scale.current;
        const right = tx.current + (x + w) * scale.current;
        const top = ty.current + y * scale.current;
        const bottom = ty.current + (y + h) * scale.current;
        if (left < m) tx.current += m - left;
        else if (right > vw - m) tx.current -= right - (vw - m);
        if (top < m) ty.current += m - top;
        else if (bottom > vh - padBottom - m) ty.current -= bottom - (vh - padBottom - m);
        clamp();
        apply();
      },
      frame: (x, y, w, h) => {
        const vp = vpRef.current;
        if (!vp) return;
        const next = computeFrame(
          { x, y, w, h },
          { w: vp.clientWidth, h: vp.clientHeight },
          { top: padTop, bottom: padBottom, x: padX },
          scale.current,
          minScale,
          tx.current,
          ty.current,
        );
        // Clamp the target to valid pan bounds without disturbing the live position, then tween to it.
        const fromScale = scale.current;
        const fromTx = tx.current;
        const fromTy = ty.current;
        scale.current = next.scale;
        tx.current = next.tx;
        ty.current = next.ty;
        clamp();
        const toScale = scale.current;
        const toTx = tx.current;
        const toTy = ty.current;
        scale.current = fromScale;
        tx.current = fromTx;
        ty.current = fromTy;
        tweenFrame(toScale, toTx, toTy);
      },
    }),
    [apply, clamp, zoomTo, tweenFrame, padTop, padBottom, padX, minScale],
  );

  // Capture only after a drag starts, so a tap's click still reaches the cell.
  const grab = (id: number) => {
    try {
      vpRef.current?.setPointerCapture(id);
    } catch {
      /* no active pointer (e.g. synthetic events) — panning still works */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore pan/pinch while a frame animation owns the view — taps still fire onClick.
    if (frameAnimActive.current) return;
    // Capture only once a drag exceeds the tap threshold, not on down, so taps still reach the cell.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointers.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      if (moved.current <= TAP_SLOP) return;
      tx.current += dx;
      ty.current += dy;
      clamp();
      apply();
      promote();
      grab(e.pointerId);
    } else if (pts.size === 2) {
      grab(e.pointerId);
      promote();
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = vpRef.current!.getBoundingClientRect();
      const cx0 = (a.x + b.x) / 2 - rect.left;
      const cy0 = (a.y + b.y) / 2 - rect.top;
      if (pinchDist.current) zoomTo(scale.current * (dist / pinchDist.current), cx0, cy0);
      pinchDist.current = dist;
      moved.current = TAP_SLOP + 1;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) settle();
  };

  // Swallow the click that follows a drag so a pan doesn't also focus a cell.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current > TAP_SLOP) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = 0;
    }
  };

  return (
    <div
      ref={vpRef}
      className={cx(viewport, className)}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div ref={stRef} className={stage} style={{ width: contentWidth, height: contentHeight }}>
        {children}
      </div>
      {edgeFade ? <div ref={fadeRef} aria-hidden="true" className={fade} /> : null}
    </div>
  );
});
