import { Link } from '@tanstack/react-router';
import { List } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Lockup } from '@/design-system';

export interface MobileTopBarProps {
  readonly onMenuClick: () => void;
}

// Phone/tablet top bar for top-level destinations (home, grilles): brand → /, menu button. Hidden at lg.
const bar = css({ flex: 'none', display: 'flex', alignItems: 'center', marginBottom: '24px', lg: { display: 'none' } });
const brandLink = css({ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', borderRadius: '12px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '4px' } });
const menuBtn = css({ marginLeft: 'auto', flex: 'none', width: '44px', height: '44px', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'rgba(255,255,255,0.62)', color: 'ws.jadeInk', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'rgba(255,255,255,0.82)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

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
