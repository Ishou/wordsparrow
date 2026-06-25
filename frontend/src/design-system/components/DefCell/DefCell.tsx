import { useLayoutEffect, useRef } from 'react';
import { CaretRight, CaretDown, ArrowBendRightDown, ArrowBendDownRight } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

// Deep-sage surface; cream text clears WCAG AA (~5.3:1). Distinct from letter tiles.
const cell = css({
  position: 'relative',
  aspectRatio: '1',
  // Honour the grid track instead of growing to fit two stacked clues.
  minHeight: 0,
  borderRadius: '9px',
  bg: 'ws.clueSurface',
  color: 'ws.clueText',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 0 0 #425C4D, 0 5px 8px -3px rgba(33,75,64,0.22)',
});
const cellActive = css({
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1.5px token(colors.ws.sakura), 0 4px 0 0 token(colors.ws.sakuraDark), 0 5px 8px -3px rgba(212,93,131,0.26)',
});
// Solved-clue text applied inline at call sites: a class `color` loses Panda's atomic ordering race against the base cream.
const DONE_TEXT = '#214B40'; // ws.jadeInk — clears WCAG AA on clueSurfaceDone (~4.7:1)
const cellValidated = css({
  bg: 'ws.clueSurfaceDone',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 0 0 #7E9C88, 0 3px 6px -3px rgba(33,75,64,0.16)',
});

const flushTop = css({ display: 'flex', alignItems: 'flex-start' });
const split = css({ display: 'flex', flexDirection: 'column' });
const halfBox = css({ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', alignItems: 'flex-start' });
const divider = css({ height: '1px', bg: 'rgba(255,255,255,0.2)' });
const clue = css({ fontFamily: 'wsClue', fontSize: '14px', fontWeight: 'bold', lineHeight: '1.04', letterSpacing: '-0.01em', textWrap: 'balance' });

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
const tabBend = css({ fontSize: '0.82em' });
const atRightMid = css({ right: '-0.5em', top: '50%', transform: 'translateY(-50%)' });
const atRightTop = css({ right: '-0.5em', top: '27%', transform: 'translateY(-50%)' });
const atRightBot = css({ right: '-0.5em', top: '73%', transform: 'translateY(-50%)' });
const atBottom = css({ bottom: '-0.5em', left: '50%', transform: 'translateX(-50%)' });

export type DefArrow = 'right' | 'down' | 'right-down' | 'down-right';

export interface DefCellProps {
  readonly clues: readonly string[];
  // Per-clue arrows; `arrow` is the single-clue shorthand. Defaults: right / down.
  readonly arrow?: DefArrow;
  readonly arrows?: readonly DefArrow[];
  readonly active?: boolean;
  // All of this cell's clue word(s) are solved → subtly lighter "done" surface.
  readonly validated?: boolean;
}

// An answer exits right (right / right-down) or down; the tab sits on that edge, pointing where it begins.
const exitsRight = (a: DefArrow) => a === 'right' || a === 'right-down';

// Binary-search font size so every clue fills its cell without overflowing.
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
  // Hyphenate only longer words (≥8 letters, ≥4 before / ≥3 after) via fr patterns, so the font stays readable.
  span.style.hyphens = 'auto';
  span.style.setProperty('-webkit-hyphens', 'auto');
  span.style.setProperty('hyphenate-limit-chars', '8 4 3');
  span.style.lineHeight = '1.04';
  let lo = 5;
  let hi = 24;
  let best = 5;
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

function Tab({ arrow, place }: { arrow: DefArrow; place: string }) {
  return (
    <span className={cx(tab, place)}>
      {arrow === 'down' && <CaretDown aria-hidden="true" weight="bold" className={tabCaret} />}
      {arrow === 'right' && <CaretRight aria-hidden="true" weight="bold" className={tabCaret} />}
      {arrow === 'right-down' && <ArrowBendRightDown aria-hidden="true" weight="bold" className={tabBend} />}
      {arrow === 'down-right' && <ArrowBendDownRight aria-hidden="true" weight="bold" className={tabBend} />}
    </span>
  );
}

// Padding reserves room on the edges where this clue's tab(s) sit.
function pad(right: boolean, bottom: boolean): string {
  return `${bottom ? 3 : 5}px ${right ? 14 : 8}px ${bottom ? 11 : 5}px 7px`;
}

export function DefCell({ clues, arrow = 'right', arrows, active = false, validated = false }: DefCellProps) {
  const isSplit = clues.length >= 2;
  if (!isSplit) {
    const a = arrows?.[0] ?? arrow;
    const r = exitsRight(a);
    return (
      <div data-defcell="single" className={cx(cell, validated && cellValidated, active && cellActive, flushTop)} style={{ padding: pad(r, !r), color: validated ? DONE_TEXT : undefined }}>
        <Clue text={clues[0]} />
        <Tab arrow={a} place={r ? atRightMid : atBottom} />
      </div>
    );
  }
  const a0 = arrows?.[0] ?? 'right';
  const a1 = arrows?.[1] ?? 'down';
  // The bottom tab lives at the cell's bottom edge, so the lower half always clears it.
  return (
    <div data-defcell="split" className={cx(cell, validated && cellValidated, active && cellActive, split)} style={validated ? { color: DONE_TEXT } : undefined}>
      <div className={halfBox} style={{ padding: pad(exitsRight(a0), false) }}>
        <Clue text={clues[0]} />
      </div>
      <div className={divider} />
      <div className={halfBox} style={{ padding: pad(exitsRight(a1), true) }}>
        <Clue text={clues[1]} />
      </div>
      <Tab arrow={a0} place={exitsRight(a0) ? atRightTop : atBottom} />
      <Tab arrow={a1} place={exitsRight(a1) ? atRightBot : atBottom} />
    </div>
  );
}
