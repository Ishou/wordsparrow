import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';

// position:fixed so the frosted bar is full-bleed on all widths; lg:hidden.
const nav = css({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  bg: 'ws.frost',
  backdropFilter: 'blur(14px)',
  borderTop: '0.5px solid rgba(33,75,64,0.10)',
  padding: '10px 28px calc(8px + env(safe-area-inset-bottom))',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  lg: { display: 'none' },
});
const navItem = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1, textDecoration: 'none', cursor: 'pointer', padding: 0, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '8px' } });
const navLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold' });

const ACTIVE = 'var(--colors-ws-sakura)';
const IDLE = 'var(--colors-ws-jade-ink)';

export interface BottomNavProps {
  readonly active: 'accueil' | 'grilles';
}

export function BottomNav({ active }: BottomNavProps) {
  const accueil = active === 'accueil';
  const grilles = active === 'grilles';
  return (
    <nav className={nav} aria-label="Navigation principale">
      <Link
        to="/"
        className={navItem}
        aria-current={accueil ? 'page' : undefined}
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.2 12 5l8 6.2V19a1 1 0 0 1-1 1h-4.2v-5.2H9.2V20H5a1 1 0 0 1-1-1z" stroke={accueil ? ACTIVE : IDLE} strokeOpacity={accueil ? 1 : 0.5} strokeWidth="1.9" strokeLinejoin="round" /></svg>
        <span className={navLabel} style={accueil ? { color: ACTIVE } : { color: IDLE, opacity: 0.55 }}>Accueil</span>
      </Link>
      <Link
        to="/grilles"
        className={navItem}
        aria-current={grilles ? 'page' : undefined}
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="13.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="4.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="13.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /></svg>
        <span className={navLabel} style={grilles ? { color: ACTIVE } : { color: IDLE, opacity: 0.55 }}>Grilles</span>
      </Link>
    </nav>
  );
}
