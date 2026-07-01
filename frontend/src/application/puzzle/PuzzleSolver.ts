// Application-layer port for whole-grid validation and the per-puzzle hint budget; concrete adapters live in `infrastructure/` (ADR-0002 §7).

// The position field name follows the wire (`column`, not the domain's `col`) so the adapter forwards with no rename.
export interface FilledCellInput {
  readonly row: number;
  readonly column: number;
  /** A single uppercase A–Z letter; cleared cells must be omitted. */
  readonly letter: string;
}

// Whole-grid binary verdict (ADR-0076 §§7–9): no positional data, so it cannot locate or reconstruct the solution.
export interface ValidationResult {
  readonly solved: boolean;
}

// Axis of the active entry, matching the wire `Direction` enum.
export type HintDirection = 'across' | 'down';

export interface RevealedWordCell {
  readonly row: number;
  readonly column: number;
  /** Canonical solution letter at this cell — single uppercase A–Z. */
  readonly letter: string;
}

export interface HintResult {
  /** Every letter cell of the revealed word, each with its canonical letter. */
  readonly cells: ReadonlyArray<RevealedWordCell>;
  /** Remaining budget after this call; `0` means the next call 429s. */
  readonly hintsRemaining: number;
  /** Seconds until the next regenerated credit; `null` when the budget is full. */
  readonly secondsUntilNextHint: number | null;
}

export type HintErrorKind =
  | 'budget-exhausted'
  | 'invalid-coord'
  | 'auth-required'
  | 'transient';

// Typed error so the UI can branch on `err.kind` instead of regexing
// `Error.message`. `hintsRemaining` is set when the server reported it
// (always `0` for `budget-exhausted`).
export class HintRequestError extends Error {
  readonly kind: HintErrorKind;
  readonly hintsRemaining: number | null;
  constructor(kind: HintErrorKind, hintsRemaining: number | null, message: string) {
    super(message);
    this.kind = kind;
    this.hintsRemaining = hintsRemaining;
    this.name = 'HintRequestError';
  }
}

export interface PuzzleSolver {
  /**
   * Submit the player's filled cells for server-side validation. Cleared
   * cells must be absent from `filledCells` (do not send `letter: null`).
   */
  validate(
    puzzleId: string,
    filledCells: ReadonlyArray<FilledCellInput>,
  ): Promise<ValidationResult>;

  /** Reveal the whole word at `(row, column, direction)`; throws `HintRequestError` on every documented 4xx and on transient failures. */
  requestHint(
    puzzleId: string,
    row: number,
    column: number,
    direction: HintDirection,
  ): Promise<HintResult>;
}
