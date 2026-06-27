import { Link, type LinkProps } from '@tanstack/react-router';
import { CaretLeft } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Lockup } from '@/design-system';

export interface BackHeaderProps {
  readonly to?: LinkProps['to'];
}

const row = css({ display: 'flex', alignItems: 'center', gap: '10px' });
const back = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flex: 'none',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textDecoration: 'none',
  borderRadius: '999px',
  padding: '6px 12px 6px 8px',
  bg: 'rgba(255,255,255,0.62)',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  _hover: { bg: 'rgba(255,255,255,0.82)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const spacer = css({ flex: 1 });

export function BackHeader({ to = '/v2' }: BackHeaderProps = {}) {
  return (
    <div className={row}>
      <Link to={to} className={back}>
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
        Retour
      </Link>
      <span className={spacer} />
      <Lockup orientation="horizontal" tone="jade" iconSize={24} textSize={17} gap={7} />
    </div>
  );
}
