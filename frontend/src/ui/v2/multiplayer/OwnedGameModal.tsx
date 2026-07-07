import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { Link } from '@tanstack/react-router';
import { GameController, ArrowClockwise } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { Lobby, LobbyId } from '@/domain/game';
import { useCanSubscribe } from '@/ui/components/billing';

// ADR-0098 §6: informational (not paywall) modal when a create resolves to the one active game you already own — rejoin, optional sole-occupant fresh-start, subtle subscriber hint. Accessible via the Ark Dialog primitive (ADR-0050).

// Mirrors HostSignInSheet: phone/tablet bottom-sheet, desktop centred modal.
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
const badge = css({ width: '52px', height: '52px', borderRadius: '50%', bg: 'ws.jade', color: 'ws.jadeInk', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' });
const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', lineHeight: '1.15' });
const text = css({ fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.4', maxWidth: '300px' });
const primaryBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', height: '50px', borderRadius: '14px', bg: 'ws.jadeInk', color: 'ws.onJadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', border: 'none', cursor: 'pointer', transition: 'opacity 120ms', marginTop: '2px', _disabled: { opacity: 0.6, cursor: 'default' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const secondary = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', border: 'none', background: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '8px', cursor: 'pointer', _disabled: { opacity: 0.6, cursor: 'default' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '8px' } });
const hint = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'semibold', color: 'ws.khaki', lineHeight: '1.4', maxWidth: '300px', margin: 0, opacity: 0.85 });
const hintLink = css({ color: 'ws.jadeInk', fontFamily: 'wsUi', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', padding: '2px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '2px' } });
const dismiss = css({ width: '100%', border: 'none', background: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '6px', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export function OwnedGameModal({
  lobby,
  canStartNew,
  onRejoindre,
  onStartNew,
  onClose,
  startingNew = false,
}: {
  // Non-null opens the modal; `null` keeps it closed.
  readonly lobby: (Lobby & { readonly id: LobbyId }) | null;
  // Whether to offer the sole-occupant fresh-start affordance (ADR-0098
  // §6): relinquishing a populated room would strand its peers.
  readonly canStartNew: boolean;
  readonly onRejoindre: () => void;
  readonly onStartNew: () => void;
  readonly onClose: () => void;
  readonly startingNew?: boolean;
}) {
  const canSubscribe = useCanSubscribe();
  return (
    <Dialog.Root
      open={lobby != null}
      onOpenChange={(d) => { if (!d.open) onClose(); }}
      modal
      lazyMount
      unmountOnExit
      closeOnInteractOutside
      closeOnEscape
      preventScroll
    >
      <Portal>
        <Dialog.Backdrop className={scrim} data-testid="owned-game-modal-backdrop" />
        <Dialog.Positioner className={positioner}>
          <Dialog.Content className={sheet}>
            <span aria-hidden="true" className={grab} />
            <span className={badge}><GameController size={24} weight="fill" aria-hidden="true" /></span>
            <Dialog.Title className={title}>Vous avez déjà une partie en cours</Dialog.Title>
            <Dialog.Description className={text}>
              Le niveau gratuit permet une partie active à la fois. Rejoignez-la, ou reprenez à zéro.
            </Dialog.Description>
            <button type="button" className={primaryBtn} onClick={onRejoindre} disabled={startingNew}>
              Rejoindre ma partie
            </button>
            {canStartNew ? (
              <button type="button" className={secondary} onClick={onStartNew} disabled={startingNew} aria-busy={startingNew || undefined}>
                <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
                {startingNew ? 'Création…' : 'Démarrer une nouvelle partie'}
              </button>
            ) : null}
            {canSubscribe ? (
              <p className={hint}>
                Les abonnés peuvent créer plusieurs parties en même temps.{' '}
                <Link to="/abonnement" className={hintLink} onClick={onClose}>
                  En savoir plus
                </Link>
              </p>
            ) : null}
            <button type="button" className={dismiss} onClick={onClose}>
              Plus tard
            </button>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
