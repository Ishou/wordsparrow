import { css, cx } from 'styled-system/css';

export type DifficultyLevel = 'facile' | 'moyen' | 'difficile';

export interface DifficultyDotsProps {
  readonly level: DifficultyLevel;
}

const FILLED: Record<DifficultyLevel, number> = { facile: 1, moyen: 2, difficile: 3 };
const LABEL: Record<DifficultyLevel, string> = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

const row = css({ display: 'inline-flex', alignItems: 'center', gap: 'xs' });
const name = css({ fontSize: 'sm', fontWeight: 'semibold', color: 'ws.jadeInk' });
const dot = css({ width: '9px', height: '9px', borderRadius: '999px', bg: 'ws.sable' });
const dotOn = css({ bg: 'ws.sakura' });

export function DifficultyDots({ level }: DifficultyDotsProps) {
  const filled = FILLED[level];
  return (
    <span className={row} aria-label={`Niveau : ${LABEL[level]}`}>
      <span className={name}>Niveau · {LABEL[level]}</span>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" className={cx(dot, i < filled && dotOn)} />
      ))}
    </span>
  );
}
