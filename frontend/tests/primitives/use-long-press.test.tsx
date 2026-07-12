import type { PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from '@/ui/components/primitives/useLongPress';

const evt = (x = 0, y = 0) => ({ clientX: x, clientY: y }) as ReactPointerEvent;

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onLongPress after the delay and suppresses the next click once', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(result.current.consumeSuppression()).toBe(true);
    expect(result.current.consumeSuppression()).toBe(false);
  });

  it('does not fire on a short press and does not suppress the click', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.handlers.onPointerUp());
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumeSuppression()).toBe(false);
  });

  it('cancels when the pointer moves beyond the threshold', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500, moveThresholdPx: 10 }),
    );
    act(() => result.current.handlers.onPointerDown(evt(0, 0)));
    act(() => result.current.handlers.onPointerMove(evt(20, 0)));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: false, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire after the component unmounts', () => {
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
