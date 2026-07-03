import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { Link } from '@tanstack/react-router';
import { Lock, Sparkle, type Icon } from '@phosphor-icons/react';
import { css } from 'styled-system/css';

// Which gate triggered the sheet — picks the copy. Cosmetic only; the server enforces the lock (ADR-0080 W5b).
export type SheetContext = 'grid' | 'generate';

// Mirrors MenuSheet: phone/tablet bottom-sheet, desktop centred modal.
const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out', '&[data-state="closed"]': { animation: 'wsFadeOut 180ms ease-out forwards' } });
const positioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', lg: { alignItems: 'center' } });
const sheet = css({
  width: '100%',
  maxWidth: '440px',
  bg: 'ws.card',
  borderTopLeftRadius: '22px',
  borderTopRightRadius: '22px',
  padding: '12px 18px calc(22px + env(safe-area-inset-bottom))',
  boxShadow: '0 -8px 30px rgba(20,40,34,0.22)',
  fontFamily: 'wsUi',
  animation: 'wsSheetUp 260ms cubic-bezier(0.32,0.72,0,1)',
  '&[data-state="closed"]': { animation: 'wsSheetDown 260ms cubic-bezier(0.32,0.72,0,1) forwards' },
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'center',
  outline: 'none',
  lg: {
    maxWidth: '380px',
    borderRadius: '22px',
    paddingBottom: '22px',
    animation: 'wsFade 150ms ease-out',
    '&[data-state="closed"]': { animation: 'wsFadeOut 150ms ease-out forwards' },
  },
});
const grab = css({ width: '42px', height: '5px', borderRadius: '999px', bg: 'rgba(33,75,64,0.18)', lg: { display: 'none' } });
const badge = css({ width: '52px', height: '52px', borderRadius: '50%', bg: 'ws.sakuraBlush', color: 'ws.sakuraDark', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' });
const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', lineHeight: '1.15' });
const text = css({ fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.4', maxWidth: '300px' });
const primary = css({ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', border: 'none', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15.5px', padding: '13px', borderRadius: '14px', cursor: 'pointer', boxShadow: '0 8px 18px rgba(190,73,112,0.34)', marginTop: '2px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const secondary = css({ width: '100%', border: 'none', background: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '6px', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

const COPY: Record<SheetContext, { readonly icon: Icon; readonly title: string; readonly text: string }> = {
  grid: {
    icon: Lock,
    title: 'Une grille réservée aux abonnés',
    text: "Abonne-toi pour jouer toutes les grilles et tout l'historique. La grille du jour et les 7 derniers jours restent gratuits.",
  },
  generate: {
    icon: Sparkle,
    title: 'Génère une nouvelle grille',
    text: "Une grille fraîche dès que l'envie te prend, autant que tu veux. C'est compris dans l'abonnement.",
  },
};

export function AbonnementSheet({
  open,
  context,
  onClose,
}: {
  readonly open: boolean;
  readonly context: SheetContext;
  readonly onClose: () => void;
}) {
  const c = COPY[context];
  const Icon = c.icon;
  return (
    <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) onClose(); }} modal lazyMount unmountOnExit closeOnInteractOutside closeOnEscape preventScroll>
      <Portal>
        <Dialog.Backdrop className={scrim} data-testid="abonnement-sheet-backdrop" />
        <Dialog.Positioner className={positioner}>
          <Dialog.Content className={sheet}>
            <span aria-hidden="true" className={grab} />
            <span className={badge}><Icon size={24} weight="fill" aria-hidden="true" /></span>
            <Dialog.Title className={title}>{c.title}</Dialog.Title>
            <Dialog.Description className={text}>{c.text}</Dialog.Description>
            <Link to="/abonnement" className={primary} onClick={onClose}>
              Voir l&apos;abonnement
            </Link>
            <button type="button" className={secondary} onClick={onClose}>
              Plus tard
            </button>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
