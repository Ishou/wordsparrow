// Dot-based 1–5 perceived-difficulty picker (radiogroup, AZERTY-safe arrows).
// "Annoncée" reference is the generator's forceClaimed; the human picks what they felt.

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

const announceStyles = css({
  fontSize: 'xs',
  color: 'fgMuted',
});

const dotsStyles = css({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
});

const dotStyles = css({
  width: '28px',
  height: '28px',
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
    width: '14px',
    height: '14px',
    borderRadius: '999px',
    border: '2px solid token(colors.border)',
    bg: 'transparent',
    transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
  },
});

const dotFilledStyles = css({
  '&::before': {
    bg: 'accent',
    borderColor: 'accent',
  },
});

const SCORES: ReadonlyArray<LikertScore> = [1, 2, 3, 4, 5];

export interface PerceivedDifficultyPickerProps {
  readonly value: LikertScore | null;
  readonly onChange: (value: LikertScore) => void;
  readonly announced: number;
}

export function PerceivedDifficultyPicker({ value, onChange, announced }: PerceivedDifficultyPickerProps) {
  const groupId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Display falls back to the announced value so pristine cards show the generator's guess,
  // but the radio stays unchecked until the human actually picks (keeps "enriched" honest).
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
      <div className={labelRowStyles}>
        <span id={`${groupId}-label`} className={labelStyles}>Difficulté ressentie</span>
        <span className={announceStyles}>— annoncée : {announced}/5</span>
      </div>
      <div className={dotsStyles} role="radiogroup" aria-labelledby={`${groupId}-label`}>
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
              className={filled ? cx(dotStyles, dotFilledStyles) : dotStyles}
              onClick={() => onChange(score)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          );
        })}
      </div>
    </div>
  );
}
