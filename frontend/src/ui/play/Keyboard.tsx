import { css } from 'styled-system/css';
import { KeyboardKey } from '@/design-system';

// AZERTY on-screen keyboard shared by the solo + co-op play screens.
const KEY_ROWS = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['W', 'X', 'C', 'V', 'B', 'N'],
] as const;

// Frosted glass — mirrors the header; grid bleeds behind.
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
  // pointer:fine guards the lg hide — a touch tablet wider than 1024px has no physical keyboard.
  '@media (min-width: 1024px) and (pointer: fine)': { display: 'none' },
});
// Top rows: 10 keys across; the calc sizes each to a 10-col grid (36px = 9 inter-key gaps × 4px).
const keyRow = css({
  display: 'flex',
  gap: '4px',
  justifyContent: 'center',
  '& button': { flex: 'none', width: 'calc((100% - 36px) / 10)', minWidth: 0 },
});
// Last row: a real 10-col grid so the 6 letters sit centred (cols 3–8) while the backspace
// fills exactly the L+M footprint (cols 9–10) flush to the right edge — no floating gap.
const lastRow = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(10, 1fr)',
  gap: '4px',
  alignItems: 'center',
  '& button': { width: '100%', minWidth: 0 },
});

export interface KeyboardProps {
  readonly onLetter: (letter: string) => void;
  readonly onBackspace: () => void;
}

export function Keyboard({ onLetter, onBackspace }: KeyboardProps) {
  return (
    <div className={keyboard}>
      {KEY_ROWS.map((rowKeys, r) => {
        if (r !== KEY_ROWS.length - 1) {
          return (
            <div key={r} className={keyRow}>
              {rowKeys.map((l) => (
                <KeyboardKey key={l} type="letter" label={l} onPress={() => onLetter(l)} />
              ))}
            </div>
          );
        }
        // Two empty leading cells (cols 1–2) centre the 6 letters; backspace spans the last two (cols 9–10).
        return (
          <div key={r} className={lastRow}>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            {rowKeys.map((l) => (
              <KeyboardKey key={l} type="letter" label={l} onPress={() => onLetter(l)} />
            ))}
            <span style={{ gridColumn: 'span 2', display: 'flex' }}>
              <KeyboardKey type="backspace" onPress={onBackspace} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
