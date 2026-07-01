import type { Cell } from './Cell';

// `hintsRemaining` is server-authoritative per user; anonymous callers receive `hintsAllowed`.
export type Difficulty = 'facile' | 'moyen' | 'difficile';

export interface Puzzle {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly width: number;
  readonly height: number;
  readonly hintsAllowed: number;
  readonly hintsRemaining: number;
  /** Seconds until the next regenerated hint credit; `null` when the budget is full or the caller is anonymous. */
  readonly secondsUntilNextHint?: number | null;
  readonly cells: readonly Cell[];
  readonly difficulty?: Difficulty | null;
  readonly gridNumber?: number | null;
}
