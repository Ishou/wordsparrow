import { type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Check, Backspace } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '2.1em',
  height: '2.55em',
  paddingInline: 'xs',
  borderRadius: '7px',
  fontFamily: 'wsUi',
  fontWeight: 'semibold',
  fontSize: '19px',
  cursor: 'pointer',
  // Tap fires on pointerdown without stealing focus from the grid cell; manipulation kills the double-tap delay.
  touchAction: 'manipulation',
  boxShadow: '0 1px 0 rgba(33,75,64,0.1)',
  _focusVisible: { outline: '2px solid token(colors.ws.sakura)', outlineOffset: '1px' },
});

const byType = {
  letter: css({ bg: '#EAE6D6', color: 'ws.khaki' }),
  confirm: css({ bg: 'ws.sakura', color: 'white' }),
  backspace: css({ bg: '#DED7BE', color: 'ws.khaki' }),
} as const;

export type KeyboardKeyType = keyof typeof byType;

type LetterKeyProps = { readonly type: 'letter'; readonly label: string; readonly onPress?: () => void };
type IconKeyProps = { readonly type: 'confirm' | 'backspace'; readonly label?: string; readonly onPress?: () => void };
export type KeyboardKeyProps = LetterKeyProps | IconKeyProps;

// Icon keys carry an accessible name since their glyph is decorative.
const ARIA: Record<KeyboardKeyType, string | undefined> = {
  letter: undefined,
  confirm: 'Valider',
  backspace: 'Effacer',
};

export function KeyboardKey({ type, label, onPress }: KeyboardKeyProps) {
  // Fire on primary-button pointerdown + preventDefault so the focused grid cell never blurs (cursor stays put).
  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onPress?.();
  };
  // Enter/Space activation for keyboard users (pointerdown won't fire for them).
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onPress?.();
  };
  const handleContextMenu = (e: MouseEvent) => e.preventDefault();
  return (
    <button
      type="button"
      aria-label={ARIA[type] ?? label}
      className={cx(base, byType[type])}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      {type === 'letter' ? <span>{label}</span> : null}
      {type === 'confirm' ? <Check aria-hidden="true" weight="bold" /> : null}
      {type === 'backspace' ? <Backspace aria-hidden="true" weight="bold" /> : null}
    </button>
  );
}
