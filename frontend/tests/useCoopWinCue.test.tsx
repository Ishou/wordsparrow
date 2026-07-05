import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCoopWinCue } from '@/ui/v2/multiplayer/useCoopWinCue';

function makePlayer() {
  return { playWordValidated: vi.fn(), playPuzzleSolved: vi.fn() };
}

describe('useCoopWinCue', () => {
  it('fires the win cue once on the IN_PROGRESS→COMPLETED transition', () => {
    const soundPlayer = makePlayer();
    const { rerender } = renderHook(({ s }) => useCoopWinCue(s, soundPlayer), {
      initialProps: { s: 'IN_PROGRESS' },
    });
    rerender({ s: 'COMPLETED' });
    expect(soundPlayer.playPuzzleSolved).toHaveBeenCalledTimes(1);
    // A re-render that stays COMPLETED must not re-fire.
    rerender({ s: 'COMPLETED' });
    expect(soundPlayer.playPuzzleSolved).toHaveBeenCalledTimes(1);
  });

  it('stays silent when a lobby loads already COMPLETED (cold-load)', () => {
    const soundPlayer = makePlayer();
    renderHook(({ s }) => useCoopWinCue(s, soundPlayer), {
      initialProps: { s: 'COMPLETED' },
    });
    expect(soundPlayer.playPuzzleSolved).not.toHaveBeenCalled();
  });

  it('does not fire on the WAITING→IN_PROGRESS transition', () => {
    const soundPlayer = makePlayer();
    const { rerender } = renderHook(({ s }) => useCoopWinCue(s, soundPlayer), {
      initialProps: { s: 'WAITING' },
    });
    rerender({ s: 'IN_PROGRESS' });
    expect(soundPlayer.playPuzzleSolved).not.toHaveBeenCalled();
  });

  it('never throws when no player is provided', () => {
    expect(() =>
      renderHook(({ s }) => useCoopWinCue(s, undefined), {
        initialProps: { s: 'IN_PROGRESS' },
      }).rerender({ s: 'COMPLETED' }),
    ).not.toThrow();
  });
});
