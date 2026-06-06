// ADR-0050 §6: 56 px touch-target minimum on every verdict button.

import { useEffect, useRef } from 'react';
import { css, cx } from 'styled-system/css';
import type { ItemPair, PairVerdict } from '@/application/survey';
import { categorieLabel, posLabel } from './labels';
import { StyleTooltip } from './StyleTooltip';

const cardStyles = css({
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'lg',
  padding: 'lg',
  display: 'flex',
  flexDirection: 'column',
  gap: 'md',
  boxShadow: '0 1px 2px rgba(31, 46, 37, 0.04)',
});

const titleStyles = css({
  fontFamily: 'heading',
  fontSize: { base: '2xl', md: 'display' },
  fontWeight: 'bold',
  letterSpacing: '-0.02em',
  margin: 0,
  color: 'fg',
});

const pairGridStyles = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 'md',
});

const sideStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  border: '1px solid token(colors.border)',
  borderRadius: 'sm',
  padding: 'md',
  minWidth: 0,
});

const sideHeadingStyles = css({
  fontSize: 'sm',
  fontWeight: 'semibold',
  color: 'fgMuted',
  margin: 0,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

const chipRowStyles = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'xs',
  margin: 0,
});

const chipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: '8px',
  paddingBlock: '3px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  color: 'fgMuted',
  border: '1px solid token(colors.border)',
  borderRadius: '999px',
});

// Read-only mirror of the binary band's filled "suggested" pill (accent fill, no interactivity).
const categoriePillStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  paddingInline: '8px',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
});

const difficultyRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'xs',
  fontSize: 'sm',
  color: 'fgMuted',
  margin: 0,
});

const difficultyDotsStyles = css({
  display: 'inline-flex',
  gap: '2px',
  alignItems: 'center',
});

const difficultyDotStyles = css({
  width: '14px',
  height: '14px',
  borderRadius: '999px',
  bg: 'neutral.300',
  '&[data-filled="true"]': { bg: 'accent' },
});

const definitionStyles = css({
  fontFamily: 'heading',
  fontSize: { base: 'md', md: 'lg' },
  fontStyle: 'italic',
  color: 'fg',
  margin: 0,
  paddingBlock: 'xs',
  paddingInline: 'md',
  borderLeft: '3px solid token(colors.accent)',
});

const verdictRowStyles = css({
  display: 'grid',
  gridTemplateColumns: { base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
  gap: 'sm',
});

const verdictButtonBase = css({
  minHeight: '64px',
  minWidth: '56px',
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  paddingInline: 'md',
  paddingBlock: 'sm',
  fontFamily: 'body',
  fontSize: 'body',
  fontWeight: 'semibold',
  borderRadius: '10px',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, border-color 120ms ease-out, opacity 120ms ease-out',
  // Label grows to fill so every kbd anchors to the same baseline, despite 1- vs 2-line labels.
  '& > span': { flex: 1, display: 'flex', alignItems: 'center', textAlign: 'center' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

// The two directional picks share the accent fill — the arrow + label disambiguate them.
const verdictLeftStyles = css({
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  _hover: { bg: 'primary.400' },
});

const verdictRightStyles = verdictLeftStyles;

const verdictBothGoodStyles = css({
  bg: 'primary.100',
  color: 'fg',
  border: '1px solid token(colors.primary.300)',
  _hover: { bg: 'primary.200' },
});

const verdictBothBadStyles = css({
  bg: 'terra.100',
  color: 'fg',
  border: '1px solid token(colors.terra.300)',
  _hover: { bg: 'terra.200' },
});

const verdictSkipStyles = css({
  bg: 'surfaceMuted',
  color: 'fg',
  border: '1px solid token(colors.border)',
  _hover: { bg: 'neutral.300' },
});

const kbdStyles = css({
  fontFamily: 'mono',
  fontSize: 'xs',
  fontWeight: 'normal',
  paddingInline: '5px',
  paddingBlock: '1px',
  borderRadius: 'sm',
  bg: 'surfaceElevated',
  border: '1px solid token(colors.border)',
  color: 'fgMuted',
});

// Read-only mirror of the binary band's difficulty dots — forceClaimed is announced, not editable here.
function AnnouncedDifficulty({ value }: { readonly value: number }) {
  return (
    <p className={difficultyRowStyles}>
      Difficulté annoncée
      <span className={difficultyDotsStyles} aria-label={`${value} sur 5`} role="img">
        {[1, 2, 3, 4, 5].map((score) => (
          <span key={score} className={difficultyDotStyles} data-filled={score <= value} aria-hidden="true" />
        ))}
      </span>
    </p>
  );
}

export interface PairCardProps {
  readonly pair: ItemPair;
  readonly onVerdict: (verdict: PairVerdict, latencyMs: number) => Promise<void> | void;
  readonly disabled?: boolean;
}

export function PairCard({ pair, onVerdict, disabled = false }: PairCardProps) {
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    startedAtRef.current = performance.now();
    function handler(event: KeyboardEvent): void {
      if (disabled) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const key = event.key === ' ' ? 'space' : event.key === 'Escape' ? 'escape' : event.key.toLowerCase();
      // G/D = gauche/droite; J/K/L mirror binary mode's mauvaise/passer/bonne.
      const verdict: PairVerdict | null =
        key === 'g' ? 'LEFT_WINS'
        : key === 'd' ? 'RIGHT_WINS'
        : key === 'j' ? 'BOTH_BAD'
        : key === 'l' ? 'BOTH_GOOD'
        : key === 'k' || key === 'space' || key === 'escape' ? 'SKIP'
        : null;
      if (verdict === null) return;
      event.preventDefault();
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
      void onVerdict(verdict, latencyMs);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pair.left.itemId, pair.right.itemId, onVerdict, disabled]);

  function submit(verdict: PairVerdict): void {
    if (disabled) return;
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
    void onVerdict(verdict, latencyMs);
  }

  return (
    <article className={cardStyles} aria-live="polite" data-testid="pair-card">
      <h2 className={titleStyles}>{pair.mot}</h2>
      <div className={pairGridStyles}>
        <section className={sideStyles} aria-label="Définition de gauche" data-side="left">
          <h3 className={sideHeadingStyles}>Gauche</h3>
          <p className={chipRowStyles}>
            <span className={chipStyles} data-chip="pos">{posLabel(pair.left.pos)}</span>
            <span className={categoriePillStyles} data-chip="categorie">
              {categorieLabel(pair.left.categorie)}
            </span>
          </p>
          <blockquote className={definitionStyles}>{pair.left.definition}</blockquote>
          <StyleTooltip style={pair.left.style} definition={pair.left.definition} mot={pair.mot} />
          <AnnouncedDifficulty value={pair.left.forceClaimed} />
        </section>
        <section className={sideStyles} aria-label="Définition de droite" data-side="right">
          <h3 className={sideHeadingStyles}>Droite</h3>
          <p className={chipRowStyles}>
            <span className={chipStyles} data-chip="pos">{posLabel(pair.right.pos)}</span>
            <span className={categoriePillStyles} data-chip="categorie">
              {categorieLabel(pair.right.categorie)}
            </span>
          </p>
          <blockquote className={definitionStyles}>{pair.right.definition}</blockquote>
          <StyleTooltip style={pair.right.style} definition={pair.right.definition} mot={pair.mot} />
          <AnnouncedDifficulty value={pair.right.forceClaimed} />
        </section>
      </div>

      <div
        className={verdictRowStyles}
        role="group"
        aria-label="Comparaison des deux définitions"
        aria-keyshortcuts="g d j k l space escape"
      >
        <button
          type="button"
          className={cx(verdictButtonBase, verdictLeftStyles)}
          aria-label="Préférer la définition de gauche"
          aria-disabled={disabled || undefined}
          data-verdict="LEFT_WINS"
          onClick={() => submit('LEFT_WINS')}
        >
          <span>← Préférer celle-ci</span>
          <kbd className={kbdStyles}>G</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictRightStyles)}
          aria-label="Préférer la définition de droite"
          aria-disabled={disabled || undefined}
          data-verdict="RIGHT_WINS"
          onClick={() => submit('RIGHT_WINS')}
        >
          <span>Préférer celle-ci →</span>
          <kbd className={kbdStyles}>D</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictBothBadStyles)}
          aria-label="Les deux définitions sont mauvaises"
          aria-disabled={disabled || undefined}
          data-verdict="BOTH_BAD"
          onClick={() => submit('BOTH_BAD')}
        >
          <span>Les deux mauvaises</span>
          <kbd className={kbdStyles}>J</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictSkipStyles)}
          aria-label="Passer cette paire"
          aria-disabled={disabled || undefined}
          data-verdict="SKIP"
          onClick={() => submit('SKIP')}
        >
          <span>Passer</span>
          <kbd className={kbdStyles}>K</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictBothGoodStyles)}
          aria-label="Les deux définitions sont bonnes"
          aria-disabled={disabled || undefined}
          data-verdict="BOTH_GOOD"
          onClick={() => submit('BOTH_GOOD')}
        >
          <span>Les deux bonnes</span>
          <kbd className={kbdStyles}>L</kbd>
        </button>
      </div>
    </article>
  );
}
