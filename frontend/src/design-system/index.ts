// Design system v2 barrel (ADR-0072) — isolated from app layers via eslint-boundaries.
export const DESIGN_SYSTEM_VERSION = '2.0.0-alpha';

export { Cell, type CellProps, type CellState } from './components/Cell/Cell';
export { DefCell, type DefCellProps, type DefArrow } from './components/DefCell/DefCell';
