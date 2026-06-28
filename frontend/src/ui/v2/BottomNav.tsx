import { useNavigate } from '@tanstack/react-router';
import { css } from 'styled-system/css';

// position:fixed so the frosted bar is full-bleed on all widths; lg:hidden.
const nav = css({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  bg: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(14px)',
  borderTop: '0.5px solid rgba(33,75,64,0.10)',
  padding: '10px 28px calc(8px + env(safe-area-inset-bottom))',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  lg: { display: 'none' },
});
const navItem = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '8px' } });
const navLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold' });

const ACTIVE = 'var(--colors-ws-sakura)';
const IDLE = 'var(--colors-ws-jade-ink)';

export interface BottomNavProps {
  readonly active: 'accueil' | 'grilles';
  readonly onAccountClick: () => void;
}

export function BottomNav({ active, onAccountClick }: BottomNavProps) {
  const navigate = useNavigate();
  const accueil = active === 'accueil';
  const grilles = active === 'grilles';
  return (
    <nav className={nav} aria-label="Navigation principale">
      <button
        type="button"
        className={navItem}
        aria-current={accueil ? 'page' : undefined}
        onClick={() => navigate({ to: '/' })}
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.2 12 5l8 6.2V19a1 1 0 0 1-1 1h-4.2v-5.2H9.2V20H5a1 1 0 0 1-1-1z" stroke={accueil ? ACTIVE : IDLE} strokeOpacity={accueil ? 1 : 0.5} strokeWidth="1.9" strokeLinejoin="round" /></svg>
        <span className={navLabel} style={accueil ? { color: ACTIVE } : { color: IDLE, opacity: 0.55 }}>Accueil</span>
      </button>
      <button
        type="button"
        className={navItem}
        aria-current={grilles ? 'page' : undefined}
        onClick={() => navigate({ to: '/grilles' })}
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="13.2" y="4.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="4.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /><rect x="13.2" y="13.2" width="6.6" height="6.6" rx="1.6" stroke={grilles ? ACTIVE : IDLE} strokeOpacity={grilles ? 1 : 0.5} strokeWidth="1.8" /></svg>
        <span className={navLabel} style={grilles ? { color: ACTIVE } : { color: IDLE, opacity: 0.55 }}>Grilles</span>
      </button>
      <button type="button" className={navItem} aria-haspopup="dialog" onClick={onAccountClick}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.4" r="3.6" stroke={IDLE} strokeOpacity="0.5" strokeWidth="1.8" /><path d="M5 19.5c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke={IDLE} strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span className={navLabel} style={{ color: IDLE, opacity: 0.55 }}>Compte</span>
      </button>
    </nav>
  );
}
