import { Link } from '@tanstack/react-router';
import { List } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Lockup } from '@/design-system';

export interface MobileTopBarProps {
  readonly onMenuClick: () => void;
}

// Self-contained spacing + sticky so every host renders an identical bar that pins even when the outer document scrolls (iOS dvh can outgrow the app-shell); the frosted bg hides content sliding under it.
const bar = css({
  position: 'sticky',
  top: 0,
  zIndex: 20,
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  padding: 'calc(env(safe-area-inset-top) + 22px) 22px 24px',
  bg: 'ws.barFrost',
  backdropFilter: 'blur(10px)',
  lg: { display: 'none' },
});
const brandLink = css({ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', borderRadius: '12px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '4px' } });
const menuBtn = css({ marginLeft: 'auto', flex: 'none', width: '44px', height: '44px', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'ws.glass', color: 'ws.jadeInk', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'ws.glassHover' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  return (
    <header className={bar}>
      <Link to="/" className={brandLink} aria-label="Accueil">
        <Lockup orientation="horizontal" tone="jade" iconSize={28} textSize={20} gap={9} />
      </Link>
      <button
        type="button"
        className={menuBtn}
        aria-label="Ouvrir le menu"
        aria-haspopup="dialog"
        onClick={onMenuClick}
      >
        <List size={22} weight="bold" aria-hidden="true" />
      </button>
    </header>
  );
}
