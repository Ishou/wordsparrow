import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { List } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { Lockup } from '@/design-system';
import { MenuSheet } from './MenuSheet';

// The single desktop top bar: lockup (left) · Accueil/Grilles (centre) · trailing slot + menu (right).
// Rendered only at lg; consumers keep their own mobile/tablet header below the breakpoint.
const bar = css({
  display: 'none',
  lg: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    paddingTop: '24px',
    paddingInline: '36px',
    flex: 'none',
  },
});
const brand = css({ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', borderRadius: '12px', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '4px' } });
const nav = css({ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '26px' });
const link = css({ fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', color: 'ws.jadeInk', opacity: 0.6, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', borderRadius: '8px', _hover: { opacity: 1 }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const linkActive = css({ color: 'ws.sakura', opacity: 1 });
const right = css({ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' });
const menuBtn = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'rgba(255,255,255,0.62)', color: 'ws.jadeInk', cursor: 'pointer', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'rgba(255,255,255,0.82)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export interface DesktopAppBarProps {
  readonly active?: 'accueil' | 'grilles';
  // Optional right-side slot rendered before the menu button (e.g. the play timer).
  readonly trailing?: ReactNode;
  // Feeds the menu header's streak subline; absent outside the home screen.
  readonly streak?: number;
}

export function DesktopAppBar({ active, trailing, streak }: DesktopAppBarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={bar}>
      <Link to="/v2" className={brand} aria-label="Accueil">
        <Lockup orientation="horizontal" tone="jade" iconSize={28} textSize={20} gap={9} />
      </Link>
      <nav className={nav} aria-label="Navigation principale">
        <button
          type="button"
          className={active === 'accueil' ? cx(link, linkActive) : link}
          aria-current={active === 'accueil' ? 'page' : undefined}
          onClick={() => navigate({ to: '/v2' })}
        >
          Accueil
        </button>
        <button
          type="button"
          className={active === 'grilles' ? cx(link, linkActive) : link}
          aria-current={active === 'grilles' ? 'page' : undefined}
          onClick={() => navigate({ to: '/v2/grilles' })}
        >
          Grilles
        </button>
      </nav>
      <div className={right}>
        {trailing}
        <button type="button" className={menuBtn} aria-label="Ouvrir le menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          <List size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} streak={streak} />
    </header>
  );
}
