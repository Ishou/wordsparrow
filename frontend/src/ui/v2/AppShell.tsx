import type { ReactNode } from 'react';
import { type LinkProps } from '@tanstack/react-router';
import { CaretLeft } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { BackLink } from './BackLink';
import { DesktopAppBar } from './DesktopAppBar';
import { SkipLink } from './SkipLink';

export type AppShellVariant = 'flow' | 'overlay';

export interface AppShellProps {
  readonly children: ReactNode;
  readonly variant?: AppShellVariant;
  readonly topBar?: ReactNode;
  readonly bottomBar?: ReactNode;
  readonly navActive?: 'accueil' | 'grilles';
  // Page-supplied desktop bar (e.g. a screen needing a timer/streak/trailing prop the generic navActive bar can't carry). `null` renders no desktop bar; `undefined` falls back to the default DesktopAppBar.
  readonly desktopBar?: ReactNode;
  readonly backTo?: LinkProps['to'];
  readonly headerFlush?: boolean;
  // Body stops scrolling and delegates to an inner flex:1 child, so a pinned head (e.g. tabs) can stay above a scrolling list.
  readonly fillBody?: boolean;
}

// Fills #root; never depends on 100dvh so mobile visual-viewport mismatch can't recur.
const shell = css({
  height: '100%',
  minHeight: 0,
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'wsUi',
  md: { bgImage: 'none', bg: 'var(--colors-ws-hero-flat)', justifyContent: 'center', padding: '40px 24px' },
  // Desktop: drop the surround — full-bleed gradient with a pinned top bar + scrollable content, matching home/play.
  lg: { bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0, alignItems: 'stretch' },
});

// The full-height column that lays out top/middle/bottom as a 3-row grid on mobile.
const frame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  md: { flex: 'none', maxWidth: '460px', height: 'min(900px, calc(100dvh - 80px))', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(33,75,64,0.18)' },
  // Desktop: a full-width fixed-height flex column so the bar's full-bleed frost isn't clipped and the body scrollbar lands at the screen edge; content is centred by inner, not the frame.
  lg: { flex: 1, maxWidth: 'none', minHeight: 0, marginInline: 0, borderRadius: 0, overflow: 'visible', boxShadow: 'none', bgImage: 'none' },
});

const headerSlot = css({ gridRow: '1', minHeight: 0, lg: { display: 'none' } });
// Non-flush headers keep the legacy top padding; flush headers (MobileTopBar) own their spacing.
const headerSlotPadded = css({ padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0' });

// The single scroll container. Bottom safe-area inset lives here only when there is no bottomBar.
const body = css({
  gridRow: '2',
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 22px 28px',
  // Desktop: full-width scroller; scrollbarGutter reserves the scrollbar's track so it never overlaps the centred content.
  lg: { paddingInline: 0, paddingTop: '26px', paddingBottom: '56px', scrollbarGutter: 'stable' },
});
const bodyBottomInset = css({ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)', lg: { paddingBottom: '56px' } });
const bodyFlushTop = css({ paddingTop: 0, lg: { paddingTop: '26px' } });
// Body stops scrolling and becomes a flex column so an inner flex:1 child owns the scroll instead.
const bodyFill = css({ overflowY: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: 0, lg: { paddingBottom: 0 } });

const bottomSlot = css({ gridRow: '3', minHeight: 0 });

// Desktop centres the 680px reading column inside the full-width scroller; passthrough on phone/tablet.
const inner = css({ display: 'contents', lg: { display: 'block', width: '100%', maxWidth: '680px', marginInline: 'auto', paddingInline: '36px' } });
// Standalone (never stacked with `inner`): the flex column that lets a fillBody child pin a head above a scrolling body.
const innerFill = css({ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, lg: { width: '100%', maxWidth: '680px', marginInline: 'auto', paddingInline: '36px' } });

// Desktop-only page Retour (the mobile BackHeader is hidden at lg); pill matches BackHeader's.
const deskBack = css({
  display: 'none',
  lg: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '18px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', color: 'ws.jadeInk', textDecoration: 'none', borderRadius: '999px', padding: '8px 14px 8px 10px', bg: 'ws.glass', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'ws.glassHover' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } },
});

// Overlay (grid pages): full-bleed middle, no scroll; bars float translucently over the bleeding grid.
const overlayFrame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top), var(--colors-ws-hero-bottom))',
  md: { flex: 'none', maxWidth: '720px', height: 'min(920px, calc(100dvh - 64px))', borderRadius: '28px', boxShadow: '0 24px 60px rgba(33,75,64,0.18)' },
  lg: { flex: 1, maxWidth: 'none', borderRadius: 0, boxShadow: 'none' },
});
const overlayMain = css({ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' });
const overlayTop = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, paddingTop: 'env(safe-area-inset-top)', lg: { position: 'static', paddingTop: 0 } });
const overlayBottom = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, paddingBottom: 'env(safe-area-inset-bottom)', lg: { position: 'static', paddingBottom: 0 } });

export function AppShell({ children, variant = 'flow', topBar, bottomBar, navActive, desktopBar, backTo, headerFlush, fillBody }: AppShellProps) {
  if (variant === 'overlay') {
    return (
      <div className={shell} lang="fr">
        <SkipLink />
        <div className={overlayFrame}>
          {desktopBar !== undefined ? desktopBar : <DesktopAppBar active={navActive} />}
          <main id="main-content" tabIndex={-1} className={overlayMain}>
            {topBar != null ? <div className={overlayTop}>{topBar}</div> : null}
            {children}
            {bottomBar != null ? <div className={overlayBottom}>{bottomBar}</div> : null}
          </main>
        </div>
      </div>
    );
  }
  return (
    <div className={shell} lang="fr">
      <SkipLink />
      <div className={frame}>
        {desktopBar !== undefined ? desktopBar : <DesktopAppBar active={navActive} />}
        {topBar != null ? <div className={cx(headerSlot, !headerFlush && headerSlotPadded)}>{topBar}</div> : null}
        <main id="main-content" tabIndex={-1} className={cx(body, bottomBar == null && bodyBottomInset, headerFlush && bodyFlushTop, fillBody && bodyFill)}>
          <div className={fillBody ? innerFill : inner}>
            {backTo != null ? (
              <BackLink to={backTo} className={deskBack}>
                <CaretLeft size={16} weight="bold" aria-hidden="true" />
                Retour
              </BackLink>
            ) : null}
            {children}
          </div>
        </main>
        {bottomBar != null ? <div className={bottomSlot}>{bottomBar}</div> : null}
      </div>
    </div>
  );
}
