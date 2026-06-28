import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

// Shared v2 CTAs (ADR-0072): one sakuraDark primary + one frosted secondary, used across every screen.

const base = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  border: 'none',
  borderRadius: '15px',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  letterSpacing: '0.01em',
  cursor: 'pointer',
  transition: 'transform 120ms, background-color 120ms, box-shadow 120ms',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { cursor: 'default', _hover: { transform: 'none', boxShadow: 'none' }, _active: { transform: 'none' } },
});

const primaryCss = css({
  height: '54px',
  fontSize: '18px',
  bg: 'ws.sakuraDark',
  color: 'white',
  boxShadow: '0 8px 18px rgba(212,93,131,0.32)',
  _hover: { transform: 'translateY(-1px)', boxShadow: '0 12px 24px rgba(212,93,131,0.42)' },
  _active: { transform: 'translateY(1px)', boxShadow: '0 4px 12px rgba(212,93,131,0.30)' },
  _disabled: { bg: 'ws.khaki', opacity: 0.45, boxShadow: 'none' },
});

const secondaryCss = css({
  height: '50px',
  fontSize: '16px',
  bg: 'rgba(255,255,255,0.62)',
  color: 'ws.jadeInk',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  _hover: { bg: 'rgba(255,255,255,0.92)', transform: 'translateY(-1px)', boxShadow: '0 6px 16px rgba(33,75,64,0.14)' },
  _active: { transform: 'translateY(1px)' },
  _disabled: { opacity: 0.55 },
});

export interface V2ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly fullWidth?: boolean;
}

function Button(
  variantCss: string,
  { children, fullWidth = true, className, type = 'button', ...rest }: V2ButtonProps,
) {
  return (
    <button type={type} className={cx(base, variantCss, fullWidth ? css({ width: '100%' }) : undefined, className)} {...rest}>
      {children}
    </button>
  );
}

export function PrimaryButton(props: V2ButtonProps) {
  return Button(primaryCss, props);
}

export function SecondaryButton(props: V2ButtonProps) {
  return Button(secondaryCss, props);
}
