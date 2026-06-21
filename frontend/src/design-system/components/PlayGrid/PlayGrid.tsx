import { css } from 'styled-system/css';
import { renderCell } from '../Grid/Grid';
import type { GridLayout } from '../Grid/layout';

// The play-screen board (PlayGrid.dc.html): fixed-size keycaps on a fixed track,
// no frame — it bleeds past its window and zooms as a whole.
export const DAILY_BOARD: GridLayout = {
  columns: 7,
  cells: [
    // Row 0
    { kind: 'def', clues: ['Saison'], arrow: 'right' },
    { kind: 'letter', letter: 'É' },
    { kind: 'letter', letter: 'T' },
    { kind: 'letter', letter: 'É' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Lac alpin'], arrow: 'down' },
    { kind: 'empty' },
    // Row 1
    { kind: 'def', clues: ['Métal précieux'], arrow: 'right' },
    { kind: 'letter', letter: 'O' },
    { kind: 'letter', letter: 'R' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Rapace'], arrow: 'right' },
    { kind: 'letter', letter: 'A' },
    { kind: 'letter', letter: 'I' },
    // Row 2
    { kind: 'empty' },
    { kind: 'def', clues: ['Conifère'], arrow: 'down' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Fleuve'], arrow: 'right-down' },
    { kind: 'letter', letter: 'S' },
    { kind: 'letter', letter: 'E' },
    { kind: 'empty' },
    // Row 3 — active word PARIS
    { kind: 'def', clues: ['Capitale de la France'], arrow: 'right', active: true },
    { kind: 'letter', letter: 'P', cursor: true },
    { kind: 'letter', letter: 'A', active: true },
    { kind: 'letter', letter: 'R', active: true },
    { kind: 'letter', letter: 'I', active: true },
    { kind: 'letter', letter: 'S', active: true },
    { kind: 'def', clues: ['Note'], arrow: 'down' },
    // Row 4
    { kind: 'def', clues: ['Arbre fruitier'], arrow: 'down' },
    { kind: 'letter', letter: 'I' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'É' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'O' },
    { kind: 'empty' },
    // Row 5
    { kind: 'letter', letter: 'P' },
    { kind: 'letter', letter: 'N' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Sud', 'Oui'] },
    { kind: 'letter', letter: 'N' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'E' },
    // Row 6
    { kind: 'letter', letter: 'I' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'R' },
    { kind: 'letter', letter: 'I' },
    { kind: 'letter', letter: 'E' },
    { kind: 'def', clues: ["Ville d'art"], arrow: 'right' },
    { kind: 'letter', letter: 'R' },
    // Row 7
    { kind: 'def', clues: ['Mois'], arrow: 'right' },
    { kind: 'letter', letter: 'M' },
    { kind: 'letter', letter: 'A' },
    { kind: 'letter', letter: 'I' },
    { kind: 'empty' },
    { kind: 'letter', letter: 'T' },
    { kind: 'empty' },
  ],
};

const board = css({ display: 'grid', gap: '5px', fontFamily: 'wsUi', width: 'max-content' });

export interface PlayGridProps {
  readonly layout?: GridLayout;
  readonly cellSize?: number;
}

export function PlayGrid({ layout = DAILY_BOARD, cellSize = 60 }: PlayGridProps) {
  return (
    <div
      lang="fr"
      role="img"
      aria-label="Grille de mots fléchés en cours"
      className={board}
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
      }}
    >
      {layout.cells.map((spec, i) => renderCell(spec, i))}
    </div>
  );
}
