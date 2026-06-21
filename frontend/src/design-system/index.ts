// Design system v2 barrel (ADR-0072) — isolated from app layers via eslint-boundaries.
export const DESIGN_SYSTEM_VERSION = '2.0.0-alpha';

export { Cell, type CellProps, type CellState } from './components/Cell/Cell';
export { DefCell, type DefCellProps, type DefArrow } from './components/DefCell/DefCell';
export { Grid, type GridProps, type GridSize, renderCell } from './components/Grid/Grid';
export { type GridLayout, type GridCellSpec, resolveGrid } from './components/Grid/layout';
export { PlayGrid, type PlayGridProps, DAILY_BOARD } from './components/PlayGrid/PlayGrid';
export { ClueRail, type ClueRailProps, type ClueDirection } from './components/ClueRail/ClueRail';
export { Button, type ButtonProps, type ButtonVariant } from './components/Button/Button';
export { KeyboardKey, type KeyboardKeyProps, type KeyboardKeyType } from './components/KeyboardKey/KeyboardKey';
export { StatCard, type StatCardProps } from './components/StatCard/StatCard';
export { StreakPill, type StreakPillProps } from './components/StreakPill/StreakPill';
export { DifficultyDots, type DifficultyDotsProps, type DifficultyLevel } from './components/DifficultyDots/DifficultyDots';
export { CalendarDay, type CalendarDayProps, type CalendarDayState } from './components/CalendarDay/CalendarDay';
export { BottomNav, type BottomNavProps, type NavKey } from './components/BottomNav/BottomNav';
export { DailyCard, type DailyCardProps } from './components/DailyCard/DailyCard';
