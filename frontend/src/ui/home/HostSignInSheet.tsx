import { useEffect, useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { UsersThree, GoogleLogo, CircleNotch } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { AuthClient } from '@/application/auth';

// Mirrors AbonnementSheet: phone/tablet bottom-sheet, desktop centred modal.
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
const googleBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', height: '50px', borderRadius: '14px', bg: 'ws.jadeInk', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', textDecoration: 'none', cursor: 'pointer', transition: 'opacity 120ms', marginTop: '2px', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const disclosure = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'semibold', color: 'ws.khaki', lineHeight: '1.4', maxWidth: '300px', margin: 0 });
const secondary = css({ width: '100%', border: 'none', background: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '6px', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const spin = css({ animation: 'wsSpin 0.7s linear infinite' });

export function HostSignInSheet({
  open,
  authClient,
  onClose,
}: {
  readonly open: boolean;
  readonly authClient?: AuthClient;
  readonly onClose: () => void;
}) {
  // returnTo is computed post-mount so the prerender HTML never bakes a stale URL.
  const [returnTo, setReturnTo] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => setReturnTo(window.location.href), []);
  const href = authClient && returnTo ? authClient.signInUrl('google', returnTo) : '#';
  const disabled = href === '#' || redirecting;
  return (
    <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) onClose(); }} modal lazyMount unmountOnExit closeOnInteractOutside closeOnEscape preventScroll>
      <Portal>
        <Dialog.Backdrop className={scrim} data-testid="host-signin-sheet-backdrop" />
        <Dialog.Positioner className={positioner}>
          <Dialog.Content className={sheet}>
            <span aria-hidden="true" className={grab} />
            <span className={badge}><UsersThree size={24} weight="fill" aria-hidden="true" /></span>
            <Dialog.Title className={title}>Connecte-toi pour créer une partie</Dialog.Title>
            <Dialog.Description className={text}>
              Héberger une partie demande un compte. Rejoindre avec un code reste possible sans compte.
            </Dialog.Description>
            {/* Anchor required: the browser must follow the 302 chain to accept the callback Set-Cookie. */}
            <a
              href={href}
              aria-disabled={disabled ? true : undefined}
              aria-busy={redirecting || undefined}
              className={googleBtn}
              style={redirecting ? { pointerEvents: 'none', opacity: 0.85 } : undefined}
              onClick={() => { if (href !== '#') setRedirecting(true); }}
            >
              {redirecting ? (
                <>
                  <CircleNotch size={20} weight="bold" aria-hidden="true" className={spin} />
                  Connexion…
                </>
              ) : (
                <>
                  <GoogleLogo size={20} weight="bold" aria-hidden="true" />
                  Se connecter avec Google
                </>
              )}
            </a>
            <p className={disclosure}>
              Ton adresse e-mail Google est alors enregistrée pour la facturation d’un éventuel abonnement.
            </p>
            <button type="button" className={secondary} onClick={onClose}>
              Plus tard
            </button>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
