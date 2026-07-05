import { useEffect, useRef } from 'react';
import type { SoundPlayer } from '@/application/session/SoundPlayer';

export interface UseGridSoundsArgs {
  readonly validatedCount: number;
  readonly won: boolean;
  // Solo passes its mount-gate; coop omits it (the ref-seed below already absorbs the join hydration set).
  readonly userActedRef?: { readonly current: boolean };
  readonly soundPlayer?: SoundPlayer;
}

export function useGridSounds({ validatedCount, won, userActedRef, soundPlayer }: UseGridSoundsArgs): void {
  const prevCount = useRef(validatedCount);
  const prevWon = useRef(won);
  useEffect(() => {
    const added = validatedCount - prevCount.current;
    const justWon = won && !prevWon.current;
    prevCount.current = validatedCount;
    prevWon.current = won;
    const acted = userActedRef ? userActedRef.current : true;
    if (!soundPlayer || !acted) return;
    if (justWon) soundPlayer.playPuzzleSolved();
    else if (added > 0 && !won) soundPlayer.playWordValidated(added);
  }, [validatedCount, won, soundPlayer, userActedRef]);
}
