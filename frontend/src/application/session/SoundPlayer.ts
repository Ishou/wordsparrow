// Grid sound-effects player port; Web Audio adapter in @/infrastructure/session, injected via router context (ADR-0002 §7).

export interface SoundPlayer {
  /** Soft two-note chime when a word validates. No-op when muted or unsupported. */
  playWordValidated(): void;
  /** Gentle three-note arpeggio when the puzzle is solved. No-op when muted or unsupported. */
  playPuzzleSolved(): void;
}
