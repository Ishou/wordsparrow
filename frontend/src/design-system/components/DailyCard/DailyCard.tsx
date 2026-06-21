import { css } from 'styled-system/css';
import { Button } from '../Button/Button';
import { Cell } from '../Cell/Cell';
import { DefCell } from '../DefCell/DefCell';
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
  gap: '14px',
  bg: 'white',
  borderRadius: '22px',
  padding: '22px',
  width: '100%',
  maxWidth: '420px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 14px 30px rgba(33,75,64,0.1)',
});
const teaser = css({ display: 'flex', gap: '4px', marginBottom: '4px' });
const teaserBox = css({ width: '42px', height: '42px' });
const eyebrow = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8842B' });
const date = css({ fontFamily: 'wsDisplay', fontSize: '27px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: 0, lineHeight: '1.05' });

export function DailyCard({ date: d, level, onPlay }: DailyCardProps) {
  return (
    <section className={card} aria-label="Grille du jour">
      <div className={teaser} aria-hidden="true">
        <div className={teaserBox}><DefCell clues={['Oiseau']} arrow="right" /></div>
        <div className={teaserBox}><Cell state="active" letter="P" /></div>
        <div className={teaserBox}><Cell state="active" letter="I" /></div>
        <div className={teaserBox}><Cell state="active" letter="E" /></div>
      </div>
      <span className={eyebrow}>GRILLE DU JOUR</span>
      <h2 className={date}>{d}</h2>
      <DifficultyDots level={level} />
      <Button variant="primary" onClick={onPlay}>Jouer</Button>
    </section>
  );
}
