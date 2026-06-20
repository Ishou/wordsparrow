import { forwardRef } from 'react';
import { css, cx } from 'styled-system/css';

const base = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: 'body',
  paddingInline: 'lg',
  paddingBlock: 'sm',
  borderRadius: 'md',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _focusVisible: { outline: '2px solid token(colors.ws.sakura)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

const byVariant = {
  primary: css({ bg: 'ws.sakura', color: 'white', border: 'none', _hover: { bg: 'ws.sakuraDark' } }),
  secondary: css({ bg: 'transparent', color: 'ws.jadeInk', border: '1.5px solid token(colors.ws.jadeInk)', _hover: { bg: 'ws.jade' } }),
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
