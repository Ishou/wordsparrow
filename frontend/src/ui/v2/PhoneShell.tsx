import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { DesktopAppBar } from './DesktopAppBar';

export interface PhoneShellProps {
  readonly children: ReactNode;
  readonly header?: ReactNode;
  // Highlights the matching desktop nav link (Accueil/Grilles); omit on pages with no top-nav home.
  readonly navActive?: 'accueil' | 'grilles';
}

// ADR-0072 phone-width column on phones; from tablet up it becomes a contained
// app card floating on a calm jade surround (the gradient rides the card so the
// inner frosted surfaces read the same as on mobile).
const shell = css({
  minHeight: '100dvh',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'wsUi',
  md: {
    bgImage: 'none',
    bg: '#9CCBB1',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  // Desktop: drop the surround — full-bleed gradient with a top bar + contained content, matching home/play.
  lg: { bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0, alignItems: 'stretch' },
});

const frame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  md: {
    flex: 'none',
    maxWidth: '460px',
    height: 'min(900px, calc(100dvh - 80px))',
    borderRadius: '28px',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(33,75,64,0.18)',
  },
  // Desktop: match the home frame width so the top bar aligns; content is capped narrower in the body.
  lg: { flex: 1, maxWidth: '1140px', height: 'auto', minHeight: '100dvh', marginInline: 'auto', borderRadius: 0, overflow: 'visible', boxShadow: 'none', bgImage: 'none' },
});

// Phone/tablet back-header; desktop shows the shared nav bar instead.
const headerSlot = css({
  flex: 'none',
  padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0',
  lg: { display: 'none' },
});

// The scrollable body owns the `<main>` landmark so v2 screens stay pure content bodies.
const body = css({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 22px calc(env(safe-area-inset-bottom) + 28px)',
  // Desktop: a contained, centred reading column on the full-bleed gradient.
  lg: { width: '100%', maxWidth: '680px', marginInline: 'auto', overflowY: 'visible', paddingTop: '26px', paddingBottom: '56px' },
});

export function PhoneShell({ children, header, navActive }: PhoneShellProps) {
  return (
    <div className={shell} lang="fr">
      <div className={frame}>
        <DesktopAppBar active={navActive} />
        {header != null ? <div className={headerSlot}>{header}</div> : null}
        <main id="main-content" className={body}>
          {children}
        </main>
      </div>
    </div>
  );
}
