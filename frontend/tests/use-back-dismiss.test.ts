import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBackDismiss } from '@/ui/lib/useBackDismiss';

describe('useBackDismiss', () => {
  it('pushes a history entry only while active and dismisses on Back (popstate)', () => {
    const onDismiss = vi.fn();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    const { rerender } = renderHook(({ active }) => useBackDismiss(active, onDismiss), {
      initialProps: { active: false },
    });
    expect(pushSpy).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(pushSpy).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    pushSpy.mockRestore();
  });

  it('pops its sentinel (history.back) when closed via the UI, not by Back', () => {
    const onDismiss = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { rerender } = renderHook(({ active }) => useBackDismiss(active, onDismiss), {
      initialProps: { active: true },
    });
    rerender({ active: false });

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it('does not pop the sentinel when a menu item navigated forward, even if the router keeps the flag in state', () => {
    const onDismiss = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { rerender } = renderHook(({ active }) => useBackDismiss(active, onDismiss), {
      initialProps: { active: true },
    });
    // Router may retain __backDismiss in state across a forward push; guard on URL, not state.
    window.history.pushState({ __backDismiss: true }, '', '/reglages');
    rerender({ active: false });

    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
    window.history.pushState({}, '', '/');
  });

  it('does not double-pop history after Back already consumed the sentinel', () => {
    const onDismiss = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { rerender } = renderHook(({ active }) => useBackDismiss(active, onDismiss), {
      initialProps: { active: true },
    });
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    rerender({ active: false }); // parent closes in response to onDismiss

    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
