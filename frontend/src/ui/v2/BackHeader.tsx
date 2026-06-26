import { Link } from '@tanstack/react-router';
import { CaretLeft } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Lockup } from '@/design-system';

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
});
const spacer = css({ flex: 1 });

export function BackHeader() {
  return (
    <div className={row}>
      <Link to="/v2/home" className={back}>
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
        Retour
      </Link>
      <span className={spacer} />
      <Lockup orientation="horizontal" tone="jade" iconSize={24} textSize={17} gap={7} />
    </div>
  );
}
