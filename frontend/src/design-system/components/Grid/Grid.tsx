import { css } from 'styled-system/css';
import { Cell } from '../Cell/Cell';
import { DefCell } from '../DefCell/DefCell';
import { resolveGrid, type GridLayout, type GridCellSpec } from './layout';

const board = css({ display: 'grid', gap: '5px', bg: 'ws.jade', borderRadius: 'md', padding: 'sm' });
const mosaic = css({ display: 'grid', gap: '2px', bg: 'ws.jade', borderRadius: '12px', padding: '14px' });

const block = css({ borderRadius: '4px', width: '22px', height: '22px' });
// Abstract teaser — each block echoes the real board's cell colour, no glyphs.
const byKind = {
  def: css({ bg: 'ws.clueSurface' }),
  active: css({ bg: 'ws.sakura' }),
  activeWord: css({ bg: 'ws.sakuraBlush' }),
  solved: css({ bg: 'ws.sable' }),
  empty: css({ bg: 'white', boxShadow: 'inset 0 0 0 1px rgba(33,75,64,0.08)' }),
} as const;

export type GridSize = 'full' | 'mini';

export interface GridProps {
  readonly layout: GridLayout;
  readonly size?: GridSize;
}

export function renderCell(spec: GridCellSpec, key: number) {
  if (spec.kind === 'def') {
    return <DefCell key={key} clues={spec.clues} arrow={spec.arrow} active={spec.active} />;
  }
  if (spec.kind === 'letter') {
    const state = spec.cursor ? 'active' : spec.active ? 'activeWord' : 'solved';
    return <Cell key={key} state={state} letter={spec.letter} />;
  }
  return <Cell key={key} state="empty" />;
}

// Mini is an abstract mosaic — one coloured block per cell, no glyphs or tabs.
function mosaicKind(spec: GridCellSpec): keyof typeof byKind {
  if (spec.kind === 'def') return 'def';
  if (spec.kind === 'empty') return 'empty';
  if (spec.cursor) return 'active';
  if (spec.active) return 'activeWord';
  return 'solved';
}

export function Grid({ layout, size = 'full' }: GridProps) {
  const cells = resolveGrid(layout);
  const cols = `repeat(${layout.columns}, ${size === 'mini' ? '22px' : '1fr'})`;
  return (
    <div
      role="img"
      data-grid-size={size}
      aria-label="Grille de mots fléchés"
      className={size === 'mini' ? mosaic : board}
      style={{ gridTemplateColumns: cols }}
    >
      {size === 'mini'
        ? cells.map((c, i) => <span key={i} className={`${block} ${byKind[mosaicKind(c.spec)]}`} />)
        : cells.map((c, i) => renderCell(c.spec, i))}
    </div>
  );
}
