// Kept separate from the Grid component so the board logic is unit-testable.

export type GridCellSpec =
  | { readonly kind: 'empty' }
  | { readonly kind: 'letter'; readonly letter: string; readonly active?: boolean }
  | { readonly kind: 'def'; readonly clues: readonly string[]; readonly arrow?: 'right' | 'down'; readonly active?: boolean };

export interface GridLayout {
  readonly columns: number;
  readonly cells: readonly GridCellSpec[];
}

export interface ResolvedCell {
  readonly spec: GridCellSpec;
  readonly row: number;
  readonly col: number;
}

// Reject ragged layouts up front so the renderer can trust columns × rows.
export function resolveGrid(layout: GridLayout): readonly ResolvedCell[] {
  if (layout.columns < 1) throw new Error('Grid layout needs at least one column');
  if (layout.cells.length % layout.columns !== 0) {
    throw new Error(`Grid cells (${layout.cells.length}) is not a multiple of columns (${layout.columns})`);
  }
  return layout.cells.map((spec, i) => ({
    spec,
    row: Math.floor(i / layout.columns),
    col: i % layout.columns,
  }));
}

export function rowCount(layout: GridLayout): number {
  if (layout.columns < 1) throw new Error('Grid layout needs at least one column');
  if (layout.cells.length % layout.columns !== 0) {
    throw new Error(`Grid cells (${layout.cells.length}) is not a multiple of columns (${layout.columns})`);
  }
  return layout.cells.length / layout.columns;
}
