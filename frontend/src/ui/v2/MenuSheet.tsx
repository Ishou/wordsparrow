import type { ReactNode } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { useNavigate } from '@tanstack/react-router';
import {
  User,
  Gear,
  Moon,
  ChatCircleDots,
  CaretRight,
  type Icon,
} from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out' });
const positioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' });
// Compact sheet — sized so the dimmed home (appbar + greeting) stays visible above.
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
});
const grab = css({ width: '42px', height: '5px', borderRadius: '999px', bg: 'rgba(33,75,64,0.18)', margin: '0 auto 12px' });

const head = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 8px 12px', borderBottom: '1px solid #EEF3EC', marginBottom: '4px' });
const headAvatar = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '50%', bg: 'ws.sakura', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '18px' });
const headName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const headSub = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.7, marginTop: '2px' });

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
const rowSwitch = css({ ...rowBase, cursor: 'pointer' });
const rowInert = css({ ...rowBase });

const tile = css({ flex: 'none', width: '34px', height: '34px', borderRadius: '10px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const tileSoft = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });

const labelWrap = css({ display: 'flex', flexDirection: 'column', minWidth: 0 });
const label = css({ fontSize: '15px', fontWeight: 'bold', color: 'ws.jadeInk' });
const soon = css({ marginLeft: 'auto', flex: 'none', fontSize: '11px', fontWeight: 'bold', color: 'ws.khaki', bg: 'ws.sable', borderRadius: '999px', padding: '3px 9px' });
const chevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });

const sw = css({ marginLeft: 'auto', width: '42px', height: '24px', borderRadius: '999px', flex: 'none', position: 'relative', transition: 'background 160ms', bg: 'rgba(33,75,64,0.18)' });
const swKnob = css({ position: 'absolute', top: '3px', left: '3px', width: '18px', height: '18px', borderRadius: '50%', bg: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' });

const switchBtn = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const srTitle = css({ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 });

function Tile({ icon: I, soft }: { readonly icon: Icon; readonly soft?: boolean }) {
  return (
    <span className={soft ? cx(tile, tileSoft) : tile}>
      <I size={18} weight="bold" aria-hidden="true" />
    </span>
  );
}

function SoonRow({ icon, soft, children }: { readonly icon: Icon; readonly soft?: boolean; readonly children: ReactNode }) {
  return (
    <li className={rowInert} aria-disabled="true">
      <Tile icon={icon} soft={soft} />
      <span className={labelWrap}>
        <span className={label}>{children}</span>
      </span>
      <span className={soon}>Bientôt</span>
    </li>
  );
}

export interface MenuSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly streak?: number;
}

export function MenuSheet({ open, onClose, streak }: MenuSheetProps) {
  const navigate = useNavigate();

  const goReglages = () => {
    onClose();
    navigate({ to: '/v2/reglages' });
  };

  const subline = streak != null && streak >= 1 ? `Joueur invité · 🔥 série ${streak}` : 'Joueur invité';

  return (
    <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) onClose(); }} modal closeOnInteractOutside closeOnEscape preventScroll>
      <Portal>
        <Dialog.Backdrop className={scrim} data-testid="menu-sheet-backdrop" />
        <Dialog.Positioner className={positioner}>
          <Dialog.Content className={sheet}>
            <Dialog.Title className={srTitle}>Menu</Dialog.Title>
            <span aria-hidden="true" className={grab} />

            <div className={head}>
              <span className={headAvatar} aria-hidden="true">T</span>
              <div>
                <div className={headName}>Toi</div>
                <div className={headSub}>{subline}</div>
              </div>
            </div>

            <nav aria-label="Menu">
              <ul className={list}>
                <SoonRow icon={User}>Mon compte</SoonRow>
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
                <li className={rowSwitch}>
                  <button type="button" role="switch" aria-checked={false} aria-disabled="true" aria-label="Mode sombre" className={switchBtn} onClick={() => {}}>
                    <Tile icon={Moon} soft />
                    <span className={labelWrap}>
                      <span className={label}>Mode sombre</span>
                    </span>
                    <span className={sw}>
                      <span className={swKnob} />
                    </span>
                  </button>
                </li>
                <SoonRow icon={ChatCircleDots}>Aide</SoonRow>
              </ul>
            </nav>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
