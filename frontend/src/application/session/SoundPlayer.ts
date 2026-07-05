// Grid sound-effects player port; Web Audio adapter in @/infrastructure/session, injected via router context (ADR-0002 §7).

export interface SoundPlayer {
  /** One soft tick per newly-validated cell (staggered to match the flatten-ripple); no-op when muted/unsupported. */
  playWordValidated(cellCount: number): void;
  /** Gentle three-note arpeggio when the puzzle is solved. No-op when muted or unsupported. */
  playPuzzleSolved(): void;
}
