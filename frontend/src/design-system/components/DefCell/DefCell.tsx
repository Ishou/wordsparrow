import { useLayoutEffect, useRef } from 'react';
import { CaretRight, CaretDown, ArrowBendRightDown } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

// Deep-sage raised keycap (#4F6E5C) with maximized cream clue text — cream on
// this sage clears WCAG AA (~5.3:1). A distinct material from the letter tiles.
const cell = css({
  position: 'relative',
  aspectRatio: '1',
  borderRadius: '9px',
  bg: 'ws.clueSurface',
  color: 'ws.clueText',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 0 0 #425C4D, 0 5px 8px -3px rgba(33,75,64,0.22)',
});
const cellActive = css({
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1.5px token(colors.ws.sakura), 0 4px 0 0 token(colors.ws.sakuraDark), 0 5px 8px -3px rgba(212,93,131,0.26)',
});

const single = css({ display: 'flex', alignItems: 'flex-start', padding: '5px 11px 5px 7px' });
const clue = css({ fontFamily: 'wsClue', fontSize: '14px', fontWeight: 'bold', lineHeight: '1.04', letterSpacing: '-0.01em', textWrap: 'balance' });

const split = css({ display: 'flex', flexDirection: 'column' });
const half = css({ position: 'relative', flex: 1, display: 'flex', alignItems: 'flex-start', padding: '3px 12px 3px 7px' });
const divider = css({ height: '1px', bg: 'rgba(255,255,255,0.2)' });

const tab = css({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.15em',
  height: '1.15em',
  bg: 'ws.or',
  color: '#1B3F35',
  borderRadius: '5px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.32)',
  zIndex: 5,
});
const tabCaret = css({ fontSize: '0.68em' });
const tabRight = css({ right: '-0.5em', top: '50%', transform: 'translateY(-50%)' });
const tabDown = css({ bottom: '-0.5em', left: '50%', transform: 'translateX(-50%)' });

export type DefArrow = 'right' | 'down' | 'right-down';

export interface DefCellProps {
  readonly clues: readonly string[];
  readonly arrow?: DefArrow;
  readonly active?: boolean;
}

// Binary-search the largest font size that fits the clue in its cell, so short
// clues read big and long ones shrink to fit — never overflowing.
function fitSpan(span: HTMLElement) {
  const cont = span.parentElement;
  if (!cont) return;
  const cs = getComputedStyle(cont);
  const availW = cont.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = cont.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (availW <= 1 || availH <= 1) return;
  span.style.display = 'block';
  span.style.width = `${availW}px`;
  span.style.whiteSpace = 'normal';
  span.style.overflowWrap = 'normal';
  span.style.wordBreak = 'normal';
  span.style.lineHeight = '1.04';
  let lo = 8;
  let hi = 24;
  let best = 8;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    span.style.fontSize = `${mid}px`;
    if (span.scrollHeight <= availH + 0.5 && span.scrollWidth <= availW + 0.5) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  span.style.fontSize = `${Math.floor(best * 10) / 10}px`;
}

function useFitText(text: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const span = ref.current;
    if (!span) return;
    const run = () => fitSpan(span);
    run();
    const cont = span.parentElement;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && cont) {
      ro = new ResizeObserver(run);
      ro.observe(cont);
    }
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(run).catch(() => {});
    return () => ro?.disconnect();
  }, [text]);
  return ref;
}

function Clue({ text }: { text: string }) {
  return <span ref={useFitText(text)} className={clue}>{text}</span>;
}

function Tab({ arrow }: { arrow: DefArrow }) {
  const placement = arrow === 'down' ? tabDown : tabRight;
  return (
    <span className={cx(tab, placement)}>
      {arrow === 'down' && <CaretDown aria-hidden="true" weight="bold" className={tabCaret} />}
      {arrow === 'right' && <CaretRight aria-hidden="true" weight="bold" className={tabCaret} />}
      {arrow === 'right-down' && <ArrowBendRightDown aria-hidden="true" weight="bold" className={tabCaret} />}
    </span>
  );
}

export function DefCell({ clues, arrow = 'right', active = false }: DefCellProps) {
  const isSplit = clues.length >= 2;
  return (
    <div data-defcell={isSplit ? 'split' : 'single'} className={cx(cell, active && cellActive, isSplit ? split : single)}>
      {isSplit ? (
        <>
          <div className={half}>
            <Clue text={clues[0]} />
            <Tab arrow="right" />
          </div>
          <div className={divider} />
          <div className={half}>
            <Clue text={clues[1]} />
            <Tab arrow="down" />
          </div>
        </>
      ) : (
        <>
          <Clue text={clues[0]} />
          <Tab arrow={arrow} />
        </>
      )}
    </div>
  );
}
