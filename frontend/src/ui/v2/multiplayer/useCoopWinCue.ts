import { useEffect, useRef } from 'react';
import type { SoundPlayer } from '@/application/session/SoundPlayer';

// Coop win cue on the live IN_PROGRESS→COMPLETED transition; silent on cold-load of a finished lobby.
export function useCoopWinCue(lobbyState: string, soundPlayer?: SoundPlayer): void {
  const prev = useRef(lobbyState);
  useEffect(() => {
    if (prev.current === 'IN_PROGRESS' && lobbyState === 'COMPLETED') soundPlayer?.playPuzzleSolved();
    prev.current = lobbyState;
  }, [lobbyState, soundPlayer]);
}
