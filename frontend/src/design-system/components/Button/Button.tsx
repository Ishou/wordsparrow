import { forwardRef } from 'react';
import { css, cx } from 'styled-system/css';

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '17px',
  paddingInline: 'lg',
  paddingBlock: '14px',
  borderRadius: '14px',
  cursor: 'pointer',
  transition: 'box-shadow 120ms ease-out, opacity 120ms ease-out, transform 120ms ease-out',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const byVariant = {
  // sakuraDark (not sakura) so white text clears AA; hover deepens the glow, press dips. Disabled is flat khaki.
  primary: css({ bg: 'ws.sakuraDark', color: 'white', border: 'none', boxShadow: '0 8px 18px rgba(212,93,131,0.32)', '&:hover:not(:disabled)': { boxShadow: '0 10px 24px rgba(212,93,131,0.42)' }, _active: { transform: 'translateY(1px)', boxShadow: '0 4px 12px rgba(212,93,131,0.30)' }, _disabled: { bg: 'ws.khaki', opacity: 0.45, boxShadow: 'none', cursor: 'not-allowed' } }),
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
