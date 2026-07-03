// Imperative cell-focus snapshot read at click time (ADR-0002 §4); isLocked = revealed by a prior hint.
export interface FocusedCell {
  readonly row: number;
  readonly column: number;
  readonly isLocked: boolean;
}
