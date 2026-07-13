import { createRef } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PanZoom, type PanZoomHandle } from '@/ui/play/PanZoom';

// Regression: a padBottom change after interaction must not reset the user's zoom to fit.

function stageScale(container: HTMLElement): number {
  const stage = Array.from(container.querySelectorAll('div')).find((el) =>
    el.style.transform.includes('scale('),
  );
  if (!stage) throw new Error('no stage element with a scale transform');
  const m = stage.style.transform.match(/scale\(([-\d.]+)\)/);
  return m ? Number(m[1]) : NaN;
}

describe('PanZoom initial-fit lock', () => {
  let vpW: PropertyDescriptor | undefined;
  let vpH: PropertyDescriptor | undefined;

  beforeAll(() => {
    vpW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    vpH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 400, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 800, configurable: true });
  });
  afterAll(() => {
    if (vpW) Object.defineProperty(HTMLElement.prototype, 'clientWidth', vpW);
    if (vpH) Object.defineProperty(HTMLElement.prototype, 'clientHeight', vpH);
  });

  it('keeps the user zoom when padBottom changes after interaction', () => {
    const ref = createRef<PanZoomHandle>();
    const { container, rerender } = render(
      <PanZoom ref={ref} contentWidth={1000} contentHeight={2000} fit="contain" maxScale={3} padBottom={100}>
        <div style={{ width: 1000, height: 2000 }} />
      </PanZoom>,
    );

    const fit = stageScale(container);
    expect(fit).toBeLessThan(1);

    // User takes control of the zoom.
    act(() => ref.current!.zoomIn());
    const zoomed = stageScale(container);
    expect(zoomed, 'zoomIn should raise the scale above the fit floor').toBeGreaterThan(fit + 0.001);

    // Bottom bar grows (clue re-wraps) → padBottom prop changes.
    rerender(
      <PanZoom ref={ref} contentWidth={1000} contentHeight={2000} fit="contain" maxScale={3} padBottom={160}>
        <div style={{ width: 1000, height: 2000 }} />
      </PanZoom>,
    );

    const after = stageScale(container);
    expect(after, 'a padBottom change must not reset the user zoom to fit').toBeCloseTo(zoomed, 4);
  });

  it('still re-fits on a pad change before the user interacts (mount settle)', () => {
    const ref = createRef<PanZoomHandle>();
    const { container, rerender } = render(
      <PanZoom ref={ref} contentWidth={1000} contentHeight={2000} fit="contain" maxScale={3} padBottom={100}>
        <div style={{ width: 1000, height: 2000 }} />
      </PanZoom>,
    );
    const fit100 = stageScale(container);
    // No interaction yet — the measured bottom bar settling to a taller value should re-fit.
    rerender(
      <PanZoom ref={ref} contentWidth={1000} contentHeight={2000} fit="contain" maxScale={3} padBottom={300}>
        <div style={{ width: 1000, height: 2000 }} />
      </PanZoom>,
    );
    const fit300 = stageScale(container);
    expect(fit300, 'a larger padBottom leaves less room, so the fit should shrink').toBeLessThan(fit100);
  });

  it('re-arms the one-time fit when the puzzle (content size) changes', () => {
    const ref = createRef<PanZoomHandle>();
    const { container, rerender } = render(
      <PanZoom ref={ref} contentWidth={1000} contentHeight={2000} fit="contain" maxScale={3} padBottom={100}>
        <div style={{ width: 1000, height: 2000 }} />
      </PanZoom>,
    );
    act(() => ref.current!.zoomIn());
    const zoomed = stageScale(container);

    // A different puzzle: content size changes → the fit is re-armed even though the user zoomed.
    rerender(
      <PanZoom ref={ref} contentWidth={800} contentHeight={1200} fit="contain" maxScale={3} padBottom={100}>
        <div style={{ width: 800, height: 1200 }} />
      </PanZoom>,
    );
    const refit = stageScale(container);
    expect(refit, 'a new puzzle re-fits rather than keeping the old zoom').not.toBeCloseTo(zoomed, 4);
  });
});
