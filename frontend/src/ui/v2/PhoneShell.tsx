import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { CaretLeft } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { DesktopAppBar } from './DesktopAppBar';
import { SkipLink } from './SkipLink';

export interface PhoneShellProps {
  readonly children: ReactNode;
  readonly header?: ReactNode;
  // Highlights the matching desktop nav link (Accueil/Grilles); omit on pages with no top-nav home.
  readonly navActive?: 'accueil' | 'grilles';
  // Desktop-only back target; phone/tablet uses the header's BackHeader (hidden at lg).
  readonly backTo?: LinkProps['to'];
  // Header owns its own spacing (e.g. MobileTopBar): drop the slot padding + body top inset so it renders identically to home.
  readonly headerFlush?: boolean;
  // Fixed full-bleed mobile bottom nav (home/grilles only); reserves body bottom inset when present.
  readonly bottomNav?: ReactNode;
  // Body fills the viewport and delegates scrolling to an inner flex:1 child (e.g. the grilles list), instead of scrolling itself — at every width, so sticky heads (tabs) pin on mobile too.
  readonly fillBody?: boolean;
}

// ADR-0072 §2 — phone-width on phones; contained jade-surround card from tablet up.
const shell = css({
  // Cap to the viewport so the header pins and only the body scrolls (app-shell), at every width.
  height: '100dvh',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'wsUi',
  md: {
    bgImage: 'none',
    bg: 'var(--colors-ws-hero-flat)',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  // Desktop: drop the surround — full-bleed gradient with a pinned top bar + scrollable content, matching home/play.
  lg: { height: '100dvh', bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0, alignItems: 'stretch' },
});

const frame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  md: {
    flex: 'none',
    maxWidth: '460px',
    height: 'min(900px, calc(100dvh - 80px))',
    borderRadius: '28px',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(33,75,64,0.18)',
  },
  // Desktop: a full-width fixed-height flex column so the bar's full-bleed frost isn't clipped and the body scrollbar lands at the screen edge; content is centred by barInner/inner, not the frame.
  lg: { flex: 1, maxWidth: 'none', minHeight: 0, marginInline: 0, borderRadius: 0, overflow: 'visible', boxShadow: 'none', bgImage: 'none' },
});

// Phone/tablet back-header; desktop shows the shared nav bar instead.
const headerSlot = css({
  flex: 'none',
  padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0',
  lg: { display: 'none' },
});

// Desktop-only page Retour (the mobile BackHeader is hidden at lg); pill matches BackHeader's.
const deskBack = css({
  display: 'none',
  lg: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '18px',
    fontFamily: 'wsUi',
    fontSize: '15px',
    fontWeight: 'bold',
    color: 'ws.jadeInk',
    textDecoration: 'none',
    borderRadius: '999px',
    padding: '8px 14px 8px 10px',
    bg: 'ws.glass',
    boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
    _hover: { bg: 'ws.glassHover' },
    _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  },
});

// The scrollable body owns the `<main>` landmark so v2 screens stay pure content bodies.
const body = css({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 22px calc(env(safe-area-inset-bottom) + 28px)',
  // Desktop: full-width scroller; scrollbarGutter reserves the scrollbar's track so it never overlaps the centred content.
  lg: { paddingInline: 0, paddingTop: '26px', paddingBottom: '56px', scrollbarGutter: 'stable' },
});

// Desktop centres the 680px reading column inside the full-width scroller; passthrough on phone/tablet.
const inner = css({ display: 'contents', lg: { display: 'block', width: '100%', maxWidth: '680px', marginInline: 'auto', paddingInline: '36px' } });

// Extra bottom inset so content clears the fixed BottomNav; reset at lg where the nav hides.
const bodyWithNav = css({ paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)', lg: { paddingBottom: '56px' } });
// A self-spacing header (MobileTopBar) owns the top gap, so the body must not add its own.
const bodyFlushTop = css({ paddingTop: 0, lg: { paddingTop: '26px' } });
// Body stops scrolling and becomes a flex column so an inner flex:1 child owns the scroll; bottom insets move onto that child.
const bodyFill = css({ overflowY: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: 0, lg: { paddingBottom: 0 } });
// Standalone (never stacked with `inner`): stacking made inner's lg display:block beat the base flex and killed the desktop scroll chain.
const innerFill = css({ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, lg: { width: '100%', maxWidth: '680px', marginInline: 'auto', paddingInline: '36px' } });

export function PhoneShell({ children, header, navActive, backTo, headerFlush, bottomNav, fillBody }: PhoneShellProps) {
  return (
    <div className={shell} lang="fr">
      <SkipLink />
      <div className={frame}>
        <DesktopAppBar active={navActive} />
        {header != null ? (headerFlush ? header : <div className={headerSlot}>{header}</div>) : null}
        <main id="main-content" tabIndex={-1} className={cx(body, bottomNav != null && bodyWithNav, headerFlush && bodyFlushTop, fillBody && bodyFill)}>
          <div className={fillBody ? innerFill : inner}>
            {backTo != null ? (
              <Link to={backTo} className={deskBack}>
                <CaretLeft size={16} weight="bold" aria-hidden="true" />
                Retour
              </Link>
            ) : null}
            {children}
          </div>
        </main>
        {bottomNav}
      </div>
    </div>
  );
}
