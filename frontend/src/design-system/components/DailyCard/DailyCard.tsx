import { css } from 'styled-system/css';
import { Button } from '../Button/Button';
import { DifficultyDots, type DifficultyLevel } from '../DifficultyDots/DifficultyDots';

export interface DailyCardProps {
  readonly date: string;
  readonly level: DifficultyLevel;
  readonly onPlay?: () => void;
}

const card = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'sm',
  bg: 'white',
  borderRadius: 'lg',
  padding: 'lg',
  width: '100%',
  maxWidth: '420px',
});
const eyebrow = css({ fontSize: 'xs', fontWeight: 'bold', letterSpacing: '0.1em', color: 'ws.or' });
const date = css({ fontSize: 'xl', fontWeight: 'bold', color: 'ws.jadeInk', margin: 0 });

export function DailyCard({ date: d, level, onPlay }: DailyCardProps) {
  return (
    <section className={card} aria-label="Grille du jour">
      <span className={eyebrow}>GRILLE DU JOUR</span>
      <h2 className={date}>{d}</h2>
      <DifficultyDots level={level} />
      <Button variant="primary" onClick={onPlay}>Jouer</Button>
    </section>
  );
}
