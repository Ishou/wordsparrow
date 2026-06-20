import { css, cx } from 'styled-system/css';

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '2em',
  height: '2.6em',
  paddingInline: 'xs',
  borderRadius: 'sm',
  fontWeight: 'bold',
  fontSize: 'body',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(20, 50, 40, 0.12)',
  _focusVisible: { outline: '2px solid token(colors.ws.sakura)', outlineOffset: '1px' },
});

const byType = {
  letter: css({ bg: 'white', color: 'ws.khaki' }),
  confirm: css({ bg: 'ws.sakura', color: 'white' }),
  backspace: css({ bg: 'white', color: 'ws.khaki' }),
} as const;

export type KeyboardKeyType = keyof typeof byType;

export interface KeyboardKeyProps {
  readonly type: KeyboardKeyType;
  readonly label?: string;
  readonly onPress?: () => void;
}

// Icon keys carry an accessible name since their glyph is decorative.
const ARIA: Record<KeyboardKeyType, string | undefined> = {
  letter: undefined,
  confirm: 'Valider',
  backspace: 'Effacer',
};

const GLYPH: Record<KeyboardKeyType, string> = { letter: '', confirm: '✓', backspace: '⌫' };

export function KeyboardKey({ type, label, onPress }: KeyboardKeyProps) {
  const visible = type === 'letter' ? label ?? '' : GLYPH[type];
  return (
    <button type="button" aria-label={ARIA[type] ?? label} className={cx(base, byType[type])} onClick={onPress}>
      <span aria-hidden={type !== 'letter'}>{visible}</span>
    </button>
  );
}
