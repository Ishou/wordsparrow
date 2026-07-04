import { useEffect, useRef } from 'react';
import type { SoundPlayer } from '@/application/session/SoundPlayer';

export interface UseGridSoundsArgs {
  readonly validatedCount: number;
  readonly won: boolean;
  // Reads the same interaction gate PlayScreen uses to suppress the mount-time win celebration.
  readonly userActedRef: { readonly current: boolean };
  readonly soundPlayer?: SoundPlayer;
}

export function useGridSounds({ validatedCount, won, userActedRef, soundPlayer }: UseGridSoundsArgs): void {
  const prevCount = useRef(validatedCount);
  const prevWon = useRef(won);
  useEffect(() => {
    const grew = validatedCount > prevCount.current;
    const justWon = won && !prevWon.current;
    prevCount.current = validatedCount;
    prevWon.current = won;
    if (!soundPlayer || !userActedRef.current) return;
    if (justWon) soundPlayer.playPuzzleSolved();
    else if (grew && !won) soundPlayer.playWordValidated();
  }, [validatedCount, won, soundPlayer, userActedRef]);
}
