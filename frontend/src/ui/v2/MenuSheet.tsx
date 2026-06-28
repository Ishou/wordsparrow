import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { User, Gear, CaretRight, SignOut, type Icon } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { useAuth } from '@/ui/components/auth';

// Desktop uses a lighter scrim — the menu is a small anchored dropdown, not a full takeover.
const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out', lg: { bg: 'rgba(15,33,28,0.16)' } });
// Phone/tablet: bottom-centred sheet. Desktop: top-right, anchored under the header menu button.
const positioner = css({
  position: 'fixed',
  inset: 0,
  zIndex: 1001,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  lg: { alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: '72px', paddingRight: 'max(24px, calc((100vw - 1140px) / 2))' },
});
// Phone/tablet: full-width sheet that slides up. Desktop: a compact rounded dropdown card that fades in.
const sheet = css({
  width: '100%',
  maxWidth: '440px',
  bg: 'white',
  borderTopLeftRadius: '22px',
  borderTopRightRadius: '22px',
  padding: '14px 16px calc(18px + env(safe-area-inset-bottom))',
  boxShadow: '0 -8px 30px rgba(20,40,34,0.22)',
  fontFamily: 'wsUi',
  animation: 'wsSheetUp 260ms cubic-bezier(0.32,0.72,0,1)',
  outline: 'none',
  lg: {
    maxWidth: '290px',
    borderRadius: '18px',
    padding: '10px 10px 12px',
    boxShadow: '0 16px 44px rgba(20,40,34,0.22)',
    animation: 'wsFade 150ms ease-out',
  },
});
const grab = css({ display: 'block', width: '42px', height: '5px', borderRadius: '999px', bg: 'rgba(33,75,64,0.18)', margin: '0 auto 12px' });
// Generous drag target around the grab bar; touch-action:none so the vertical drag-to-dismiss isn't stolen by scroll (ADR-0016 amendment).
const dragZone = css({ touchAction: 'none', cursor: 'grab', padding: '6px 0 2px', marginTop: '-6px', _active: { cursor: 'grabbing' }, lg: { display: 'none' } });

const head = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 8px 12px', borderBottom: '1px solid #EEF3EC', marginBottom: '4px' });
// The header is a link into Mon compte.
const headLink = css({ textDecoration: 'none', cursor: 'pointer', paddingInline: '8px', paddingTop: '8px', borderTopRadius: '13px', transition: 'background-color 120ms', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-2px' } });
const headChevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });
const headAvatar = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '50%', bg: 'ws.sakuraDark', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '18px' });
const headName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const headSub = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '2px' });

const list = css({ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0', padding: 0, margin: 0 });
const rowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  minHeight: '48px',
  padding: '10px 8px',
  borderRadius: '13px',
  textAlign: 'left' as const,
  fontFamily: 'wsUi',
  border: 'none',
  background: 'transparent',
};
const rowActive = css({ ...rowBase, textDecoration: 'none', cursor: 'pointer', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

const tile = css({ flex: 'none', width: '34px', height: '34px', borderRadius: '10px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const tileSoft = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });

const labelWrap = css({ display: 'flex', flexDirection: 'column', minWidth: 0 });
const label = css({ fontSize: '15px', fontWeight: 'bold', color: 'ws.jadeInk' });
const chevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });
const srTitle = css({ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 });

function Tile({ icon: I, soft }: { readonly icon: Icon; readonly soft?: boolean }) {
  return (
    <span className={soft ? cx(tile, tileSoft) : tile}>
      <I size={18} weight="bold" aria-hidden="true" />
    </span>
  );
}


export interface MenuSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly streak?: number;
}

export function MenuSheet({ open, onClose, streak }: MenuSheetProps) {
  const navigate = useNavigate();
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const curY = useRef(0);

  const onDragDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    curY.current = 0;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - startY.current);
    curY.current = dy;
    setDragY(dy);
  };
  // Past 90 px the sheet dismisses; otherwise springs back.
  const onDragUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (curY.current > 90) onClose();
    setDragY(0);
  };

  const sheetStyle =
    dragging || dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform 240ms cubic-bezier(0.32,0.72,0,1)', animation: 'none' as const }
      : undefined;

  const goReglages = () => {
    onClose();
    navigate({ to: '/v2/reglages' });
  };

  const { state, refresh } = useAuth();
  const { authClient } = useRouteContext({ from: '__root__' });
  const authed = state.status === 'authed';
  const displayName = authed ? state.whoami.displayName : 'Invité';
  const initial = authed ? displayName.trim()[0]?.toUpperCase() ?? '?' : null;
  const subline = streak != null && streak >= 1 ? `🔥 série ${streak}` : authed ? 'Connecté' : 'Sans compte';
  const handleLogout = async () => {
    if (!authClient) return;
    onClose();
    try {
      await authClient.logout();
      await refresh();
      void navigate({ to: '/v2' });
    } catch (cause) {
      console.warn('logout failed', cause);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) onClose(); }} modal closeOnInteractOutside closeOnEscape preventScroll>
      <Portal>
        <Dialog.Backdrop className={scrim} data-testid="menu-sheet-backdrop" />
        <Dialog.Positioner className={positioner}>
          <Dialog.Content className={sheet} style={sheetStyle}>
            <Dialog.Title className={srTitle}>Menu</Dialog.Title>
            <div
              className={dragZone}
              onPointerDown={onDragDown}
              onPointerMove={onDragMove}
              onPointerUp={onDragUp}
              onPointerCancel={onDragUp}
            >
              <span aria-hidden="true" className={grab} />
            </div>

            <Link to="/v2/compte" className={cx(head, headLink)} onClick={onClose}>
              <span className={headAvatar} aria-hidden="true">
                {authed ? initial : <User size={22} weight="bold" />}
              </span>
              <div>
                <div className={headName}>{displayName}</div>
                <div className={headSub}>{subline}</div>
              </div>
              <span className={headChevron}>
                <CaretRight size={18} weight="bold" aria-hidden="true" />
              </span>
            </Link>

            <nav aria-label="Menu">
              <ul className={list}>
                <li>
                  <button type="button" className={rowActive} onClick={goReglages}>
                    <Tile icon={Gear} soft />
                    <span className={labelWrap}>
                      <span className={label}>Réglages</span>
                    </span>
                    <span className={chevron}>
                      <CaretRight size={18} weight="bold" aria-hidden="true" />
                    </span>
                  </button>
                </li>
                {authed ? (
                  <li>
                    <button type="button" className={rowActive} onClick={() => { void handleLogout(); }}>
                      <Tile icon={SignOut} soft />
                      <span className={labelWrap}>
                        <span className={label}>Se déconnecter</span>
                      </span>
                      <span className={chevron}>
                        <CaretRight size={18} weight="bold" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </nav>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
