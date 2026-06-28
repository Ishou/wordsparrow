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
  gap: '7px',
  alignItems: 'stretch',
  width: '100%',
  bg: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(10px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '18px',
  padding: '9px 10px',
  boxShadow: '0 2px 12px rgba(33,75,64,0.14)',
  '& button': { flex: 'none', width: 'calc((100% - 45px) / 10)', minWidth: 0 },
  // Desktop uses the physical keyboard; the on-screen one is phone + tablet only.
  lg: { display: 'none' },
});
const keyRow = css({ display: 'flex', gap: '5px', justifyContent: 'center' });

export interface KeyboardProps {
  readonly onLetter: (letter: string) => void;
  readonly onBackspace: () => void;
}

export function Keyboard({ onLetter, onBackspace }: KeyboardProps) {
  return (
    <div className={keyboard}>
      {KEY_ROWS.map((rowKeys, r) => (
        <div key={r} className={keyRow}>
          {rowKeys.map((l) => (
            <KeyboardKey key={l} type="letter" label={l} onPress={() => onLetter(l)} />
          ))}
          {r === KEY_ROWS.length - 1 ? <KeyboardKey type="backspace" onPress={onBackspace} /> : null}
        </div>
      ))}
    </div>
  );
}
