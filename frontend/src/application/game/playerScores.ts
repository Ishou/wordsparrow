import type { PlayerId } from '@/domain/game';

// Per-player validated-letter tally: count each locked cell against its ADR-0086 `lockedBy` owner (equals the player's coloured cells on the board). ADR-0066 (e): keyed by account-scoped `playerId`, so an account's locks aggregate across devices.
export function tallyValidatedLetters(
  lockedPositions: ReadonlyArray<{ readonly lockedBy: PlayerId }>,
): ReadonlyMap<PlayerId, number> {
  const scores = new Map<PlayerId, number>();
  for (const cell of lockedPositions) {
    scores.set(cell.lockedBy, (scores.get(cell.lockedBy) ?? 0) + 1);
  }
  return scores;
}
