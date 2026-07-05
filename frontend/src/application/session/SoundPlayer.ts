// Grid sound-effects player port; Web Audio adapter in @/infrastructure/session, injected via router context (ADR-0002 §7).

export interface SoundPlayer {
  /**
   * One soft tick per newly-validated cell, staggered to match the grid's
   * flatten-ripple (45 ms/cell). No-op when muted or unsupported.
   */
  playWordValidated(cellCount: number): void;
  /** Gentle three-note arpeggio when the puzzle is solved. No-op when muted or unsupported. */
  playPuzzleSolved(): void;
}
