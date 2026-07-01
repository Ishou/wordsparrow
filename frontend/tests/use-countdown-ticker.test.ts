import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCountdownTicker } from '@/ui/components/grid/useCountdownTicker';

describe('useCountdownTicker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a null seed', () => {
    const { result } = renderHook(() => useCountdownTicker(null));
    expect(result.current).toBeNull();
  });

  it('ticks down once per second and stops at 0', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdownTicker(600));
    expect(result.current).toBe(600);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(599);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(598);
  });

  it('re-seeds when the input changes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ seed }) => useCountdownTicker(seed),
      { initialProps: { seed: 5 as number | null } },
    );
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(4);

    rerender({ seed: 600 });
    expect(result.current).toBe(600);
  });

  it('never goes below 0', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdownTicker(2));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(0);
  });
});
