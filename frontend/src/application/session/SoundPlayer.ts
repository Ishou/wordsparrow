// Grid sound-effects player port; Web Audio adapter in @/infrastructure/session, injected via router context (ADR-0002 §7).

export interface SoundPlayer {
  /** One soft tick per newly-validated cell (staggered to match the flatten-ripple); no-op when muted/unsupported. */
  playWordValidated(cellCount: number): void;
  /**
   * The verify outcome as one accelerando sweep across the submitted cells in reading order: a
   * rising tick for each correct cell, a thud where each wrong one sits, landing on the triumphant
   * climax if clean or a soft warning if any were wrong. `verdicts` is reading-order correct/wrong
   * flags. No-op when muted/unsupported or empty.
   */
  playVerifySweep(verdicts: readonly boolean[]): void;
  /** Gentle three-note arpeggio when the puzzle is solved. No-op when muted or unsupported. */
  playPuzzleSolved(): void;
}
