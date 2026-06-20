import { css } from 'styled-system/css';
import { Cell } from '../Cell/Cell';
import { DefCell } from '../DefCell/DefCell';
import { resolveGrid, type GridLayout, type GridCellSpec } from './layout';

const board = css({ display: 'grid', gap: '5px', bg: 'ws.jade', borderRadius: 'md', padding: 'sm' });
const fullSize = css({ '& [data-cell-state], & [data-defcell]': { fontSize: '1rem' } });
const miniSize = css({ '& [data-cell-state], & [data-defcell]': { fontSize: '0.4rem' } });

export type GridSize = 'full' | 'mini';

export interface GridProps {
  readonly layout: GridLayout;
  readonly size?: GridSize;
}

function renderCell(spec: GridCellSpec, key: number) {
  if (spec.kind === 'def') {
    return <DefCell key={key} clues={spec.clues} arrow={spec.arrow} active={spec.active} />;
  }
  if (spec.kind === 'letter') {
    return <Cell key={key} state={spec.active ? 'active' : 'solved'} letter={spec.letter} />;
  }
  return <Cell key={key} state="empty" />;
}

export function Grid({ layout, size = 'full' }: GridProps) {
  const cells = resolveGrid(layout);
  return (
    <div
      data-grid-size={size}
      aria-label="Grille de mots fléchés"
      className={`${board} ${size === 'mini' ? miniSize : fullSize}`}
      style={{ gridTemplateColumns: `repeat(${layout.columns}, 1fr)` }}
    >
      {cells.map((c, i) => renderCell(c.spec, i))}
    </div>
  );
}
