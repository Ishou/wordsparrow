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

// A single verdict for one submitted cell (ADR-0099 §1): never carries the canonical letter.
export interface VerifyCellVerdict {
  readonly row: number;
  readonly column: number;
  readonly correct: boolean;
}

export interface VerifyResult {
  /** One verdict per submitted cell, same set as the request. */
  readonly cells: ReadonlyArray<VerifyCellVerdict>;
  /** Countdown to the next allowed call, seconds; always 1800 immediately after success. */
  readonly secondsUntilNextVerify: number;
}

export type VerifyErrorKind = 'cooldown-active' | 'auth-required' | 'transient';

// Typed error so the UI can branch on `err.kind` instead of regexing `Error.message`.
export class VerifyRequestError extends Error {
  readonly kind: VerifyErrorKind;
  /** Set when the server reported it (always present for `cooldown-active`). */
  readonly secondsUntilNextVerify: number | null;
  constructor(kind: VerifyErrorKind, secondsUntilNextVerify: number | null, message: string) {
    super(message);
    this.kind = kind;
    this.secondsUntilNextVerify = secondsUntilNextVerify;
    this.name = 'VerifyRequestError';
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

  /** Check filled, not-yet-locked cells against the canonical solution (ADR-0099); throws `VerifyRequestError` on every documented 4xx and on transient failures. */
  verify(
    puzzleId: string,
    cells: ReadonlyArray<FilledCellInput>,
  ): Promise<VerifyResult>;
}
