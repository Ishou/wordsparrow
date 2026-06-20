import { css, cx } from 'styled-system/css';

const cell = css({
  position: 'relative',
  aspectRatio: '1',
  borderRadius: '9px',
  bg: 'white',
  border: '1.5px solid token(colors.ws.jadeInk)',
  color: 'ws.jadeInk',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '4px',
  overflow: 'visible',
});

const activeRing = css({ boxShadow: 'inset 0 0 0 2px token(colors.ws.sakura)' });
const clue = css({ fontSize: '0.46em', lineHeight: '1.05', fontWeight: 'semibold' });
const divider = css({ height: '1px', bg: 'ws.jadeInk', opacity: '0.25', marginBlock: '2px' });
const row = css({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '3px' });
const inlineArrow = css({ color: 'ws.or', fontWeight: 'bold', flexShrink: 0 });

const tab = css({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bg: 'ws.or',
  color: 'ws.jadeInk',
  borderRadius: '4px',
  fontWeight: 'bold',
  fontSize: '0.66em',
  lineHeight: '1',
  width: '1.25em',
  height: '1.25em',
});
const tabRight = css({ right: '-0.5em', top: '50%', transform: 'translateY(-50%)' });
const tabDown = css({ bottom: '-0.5em', left: '50%', transform: 'translateX(-50%)' });

export type DefArrow = 'right' | 'down';

export interface DefCellProps {
  // One clue = single cell; two = split cell (two stacked definitions).
  readonly clues: readonly string[];
  readonly arrow?: DefArrow;
  readonly active?: boolean;
}

export function DefCell({ clues, arrow = 'right', active = false }: DefCellProps) {
  const split = clues.length >= 2;
  return (
    <div data-defcell={split ? 'split' : 'single'} className={cx(cell, active && activeRing)}>
      {split ? (
        <>
          <p className={cx(clue, row)}>
            <span>{clues[0]}</span>
            <span aria-hidden="true" className={inlineArrow}>›</span>
          </p>
          <div className={divider} />
          <p className={cx(clue, row)}>
            <span>{clues[1]}</span>
            <span aria-hidden="true" className={inlineArrow}>⌄</span>
          </p>
        </>
      ) : (
        <>
          <p className={clue}>{clues[0]}</p>
          <span aria-hidden="true" className={cx(tab, arrow === 'right' ? tabRight : tabDown)}>
            {arrow === 'right' ? '›' : '⌄'}
          </span>
        </>
      )}
    </div>
  );
}
