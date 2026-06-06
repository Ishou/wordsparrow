// 1–5 difficulty picker (radiogroup, AZERTY-safe); "Annoncée" maps to forceClaimed.

import { useId, useRef } from 'react';
import { css, cx } from 'styled-system/css';
import type { LikertScore } from '@/application/survey';

const fieldStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

const labelRowStyles = css({
  display: 'flex',
  alignItems: 'baseline',
  gap: 'xs',
  flexWrap: 'wrap',
});

const labelStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'fgMuted',
});

const dotsStyles = css({
  display: 'flex',
  gap: '2px',
  alignItems: 'center',
});

// Label-hidden mode aligns the first visible 24px dot flush with the container's
// left edge (each 36px button insets its dot by 6px).
const dotsFlushStyles = css({ marginInlineStart: '-6px' });

const dotStyles = css({
  // 36×44 keeps the WCAG AA 24×24 target while the visible 24px dot sits tighter than the old 44px button.
  width: '36px',
  height: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  border: 'none',
  bg: 'transparent',
  cursor: 'pointer',
  padding: 0,
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  '&::before': {
    content: '""',
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    bg: 'neutral.300',
    transition: 'background-color 120ms ease-out',
  },
  // Attribute-scoped selector outranks the base `::before` regardless of atomic-class source order.
  '&[data-filled="true"]::before': {
    bg: 'accent',
  },
});

const SCORES: ReadonlyArray<LikertScore> = [1, 2, 3, 4, 5];

export interface PerceivedDifficultyPickerProps {
  readonly value: LikertScore | null;
  readonly onChange: (value: LikertScore) => void;
  readonly announced: number;
  readonly labelHidden?: boolean;
}

export function PerceivedDifficultyPicker({ value, onChange, announced, labelHidden = false }: PerceivedDifficultyPickerProps) {
  const groupId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // display falls back to announced; radio stays unchecked until the human actually picks
  const display = value ?? announced;
  const activeIndex = value === null ? Math.max(0, SCORES.indexOf(display as LikertScore)) : SCORES.indexOf(value);

  function focusIndex(next: number): void {
    const clamped = Math.max(0, Math.min(SCORES.length - 1, next));
    buttonsRef.current[clamped]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = index === 0 ? SCORES.length - 1 : index - 1;
      onChange(SCORES[nextIndex]);
      focusIndex(nextIndex);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = index === SCORES.length - 1 ? 0 : index + 1;
      onChange(SCORES[nextIndex]);
      focusIndex(nextIndex);
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onChange(SCORES[index]);
    }
  }

  return (
    <div className={fieldStyles} data-testid="perceived-difficulty">
      {labelHidden ? null : (
        <div className={labelRowStyles}>
          <span id={`${groupId}-label`} className={labelStyles}>Difficulté</span>
        </div>
      )}
      <div
        className={labelHidden ? cx(dotsStyles, dotsFlushStyles) : dotsStyles}
        role="radiogroup"
        aria-label={labelHidden ? 'Difficulté' : undefined}
        aria-labelledby={labelHidden ? undefined : `${groupId}-label`}
      >
        {SCORES.map((score, index) => {
          const isSelected = value === score;
          const filled = score <= display;
          return (
            <button
              key={score}
              ref={(el) => { buttonsRef.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${score} sur 5`}
              tabIndex={index === activeIndex ? 0 : -1}
              className={dotStyles}
              data-filled={filled}
              onClick={() => onChange(score)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          );
        })}
      </div>
    </div>
  );
}
