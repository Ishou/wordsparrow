import { forwardRef } from 'react';
import { css, cx } from 'styled-system/css';

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsUi',
  fontWeight: 'extrabold',
  fontSize: '17px',
  paddingInline: 'lg',
  paddingBlock: '14px',
  borderRadius: '14px',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _focusVisible: { outline: '2px solid token(colors.ws.sakura)', outlineOffset: '2px' },
});

const byVariant = {
  // Sakura CTA carries a soft glow; disabled is a flat sable, not just dimmed.
  primary: css({ bg: 'ws.sakura', color: 'white', border: 'none', boxShadow: '0 8px 18px rgba(212,93,131,0.32)', '&:hover:not(:disabled)': { bg: 'ws.sakuraDark' }, _disabled: { bg: '#E0DAC8', color: '#A09A82', boxShadow: 'none', cursor: 'not-allowed' } }),
  secondary: css({ bg: 'transparent', color: 'ws.jadeInk', border: '1.6px solid token(colors.ws.jadeInk)', fontWeight: 'bold', '&:hover:not(:disabled)': { bg: 'ws.jade' }, _disabled: { opacity: 0.5, cursor: 'not-allowed' } }),
} as const;

export type ButtonVariant = keyof typeof byVariant;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', type = 'button', className, ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={cx(base, byVariant[variant], className)} {...rest} />;
});
