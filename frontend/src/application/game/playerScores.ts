import type { SessionId } from '@/domain/game';

// Per-player validated-letter tally: count each locked cell against its ADR-0086 `lockedBy` owner (equals the player's coloured cells on the board).
export function tallyValidatedLetters(
  lockedPositions: ReadonlyArray<{ readonly lockedBy: SessionId }>,
): ReadonlyMap<SessionId, number> {
  const scores = new Map<SessionId, number>();
  for (const cell of lockedPositions) {
    scores.set(cell.lockedBy, (scores.get(cell.lockedBy) ?? 0) + 1);
  }
  return scores;
}
