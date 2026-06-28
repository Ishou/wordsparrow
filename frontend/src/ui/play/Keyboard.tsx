import { css } from 'styled-system/css';
import { KeyboardKey } from '@/design-system';

// AZERTY on-screen keyboard shared by the solo + co-op play screens.
const KEY_ROWS = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['W', 'X', 'C', 'V', 'B', 'N'],
] as const;

// Frosted glass — mirrors the header; grid bleeds behind. The `& button` rule sizes every key to a 10-col grid.
const keyboard = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  alignItems: 'stretch',
  width: '100%',
  // Cap + centre here so the keypad renders identically whatever the wrapper (home dock vs play bottom bar).
  maxWidth: '440px',
  marginInline: 'auto',
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '18px',
  padding: '5px 6px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  // 36px = 9 inter-key gaps × 4px; tight padding + gaps maximise each key's width.
  '& button': { flex: 'none', width: 'calc((100% - 36px) / 10)', minWidth: 0 },
  // Backspace is the lone non-letter — give it ~1.7× a letter so it's an easy target.
  '& button[aria-label="Effacer"]': { width: 'calc((100% - 36px) / 10 * 1.7)' },
  // pointer:fine guards the lg hide — a touch tablet wider than 1024px has no physical keyboard.
  '@media (min-width: 1024px) and (pointer: fine)': { display: 'none' },
});
const keyRow = css({ display: 'flex', gap: '4px', justifyContent: 'center' });
// Last row: 6 letters stay centred via symmetric spacers; the backspace parks at the right edge.
const lastRow = css({ display: 'flex', gap: '4px', alignItems: 'center' });
const spacer = css({ flex: 1, minWidth: 0 });
const spacerEnd = css({ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' });

export interface KeyboardProps {
  readonly onLetter: (letter: string) => void;
  readonly onBackspace: () => void;
}

export function Keyboard({ onLetter, onBackspace }: KeyboardProps) {
  return (
    <div className={keyboard}>
      {KEY_ROWS.map((rowKeys, r) => {
        const letters = rowKeys.map((l) => (
          <KeyboardKey key={l} type="letter" label={l} onPress={() => onLetter(l)} />
        ));
        if (r !== KEY_ROWS.length - 1) {
          return <div key={r} className={keyRow}>{letters}</div>;
        }
        return (
          <div key={r} className={lastRow}>
            <span className={spacer} aria-hidden="true" />
            {letters}
            <span className={spacerEnd}>
              <KeyboardKey type="backspace" onPress={onBackspace} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
