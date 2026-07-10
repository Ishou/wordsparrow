import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridSounds } from '@/ui/play/useGridSounds';

function makePlayer() {
  return { playWordValidated: vi.fn(), playVerifySweep: vi.fn(), playPuzzleSolved: vi.fn() };
}

describe('useGridSounds', () => {
  it('stays silent when validated count grows before any user action', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: false };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 0, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 6, won: false, userActedRef, soundPlayer });
    expect(soundPlayer.playWordValidated).not.toHaveBeenCalled();
  });

  it('pulses with the count of newly-validated cells after a user action', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: true };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 5, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 10, won: false, userActedRef, soundPlayer });
    expect(soundPlayer.playWordValidated).toHaveBeenCalledTimes(1);
    expect(soundPlayer.playWordValidated).toHaveBeenCalledWith(5);
  });

  it('plays the win cue (not the word chime) on the winning transition', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: true };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 15, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 20, won: true, userActedRef, soundPlayer });
    expect(soundPlayer.playPuzzleSolved).toHaveBeenCalledTimes(1);
    expect(soundPlayer.playWordValidated).not.toHaveBeenCalled();
  });

  it('does not celebrate a grid that mounts already solved', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: false };
    renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 20, won: true, userActedRef, soundPlayer },
    });
    expect(soundPlayer.playPuzzleSolved).not.toHaveBeenCalled();
  });

  it('without a userActedRef (coop), stays silent on the mount seed but pulses on later locks', () => {
    const soundPlayer = makePlayer();
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 12, won: false, soundPlayer },
    });
    // A word locks after join → pulses with the newly-added cell count.
    rerender({ validatedCount: 17, won: false, soundPlayer });
    expect(soundPlayer.playWordValidated).toHaveBeenCalledTimes(1);
    expect(soundPlayer.playWordValidated).toHaveBeenCalledWith(5);
    // Grid completes → win cue.
    rerender({ validatedCount: 40, won: true, soundPlayer });
    expect(soundPlayer.playPuzzleSolved).toHaveBeenCalledTimes(1);
  });

  it('never throws when no player is provided', () => {
    const userActedRef = { current: true };
    expect(() =>
      renderHook((props) => useGridSounds(props), {
        initialProps: { validatedCount: 0, won: false, userActedRef, soundPlayer: undefined },
      }).rerender({ validatedCount: 5, won: false, userActedRef, soundPlayer: undefined }),
    ).not.toThrow();
  });
});
