import { css, cx } from 'styled-system/css';

export type CalendarDayState = 'solved' | 'today' | 'unsolved';

export interface CalendarDayProps {
  readonly day: number;
  readonly state: CalendarDayState;
}

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.4em',
  height: '2.4em',
  borderRadius: '999px',
  fontWeight: 'bold',
  fontSize: 'sm',
});
const byState = {
  solved: css({ bg: 'ws.sakura', color: 'white' }),
  today: css({ bg: 'transparent', color: 'ws.jadeInk', border: '1.5px solid token(colors.ws.sakura)' }),
  unsolved: css({ bg: 'ws.sable', color: 'ws.khaki' }),
} as const;
const STATE_LABEL: Record<CalendarDayState, string> = { solved: 'résolue', today: "aujourd'hui", unsolved: 'non résolue' };

export function CalendarDay({ day, state }: CalendarDayProps) {
  return (
    <span className={cx(base, byState[state])} aria-label={`Jour ${day}, ${STATE_LABEL[state]}`}>
      {day}
    </span>
  );
}
