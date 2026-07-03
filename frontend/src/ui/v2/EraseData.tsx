import { useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import { useAuth } from '@/ui/components/auth';

const dangerBtn = css({
  appearance: 'none',
  width: '100%',
  height: '46px',
  marginTop: '4px',
  borderRadius: '13px',
  border: '2px solid token(colors.ws.sakuraDark)',
  bg: 'transparent',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '14px',
  color: 'ws.sakuraDark',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sakuraBlush' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out' });
const positioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' });
const card = css({ width: '100%', maxWidth: '380px', bg: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 24px 60px rgba(20,40,34,0.28)', fontFamily: 'wsUi', outline: 'none', animation: 'wsSheetUp 240ms cubic-bezier(0.32,0.72,0,1)' });
const dlgTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk' });
const dlgDesc = css({ fontFamily: 'wsUi', fontSize: '14px', color: 'ws.khaki', marginTop: '8px', lineHeight: '1.4' });
const input = css({
  width: '100%',
  height: '44px',
  marginTop: '14px',
  borderRadius: '12px',
  border: '1.5px solid rgba(33,75,64,0.16)',
  bg: 'white',
  paddingInline: '14px',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', marginTop: '8px' });
const dlgActions = css({ display: 'flex', gap: '8px', marginTop: '16px' });
const ghostBtn = css({ flex: 1, height: '44px', borderRadius: '12px', border: 'none', bg: 'ws.sable', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk', cursor: 'pointer', _hover: { bg: 'ws.sableHover' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const confirmBtn = css({ flex: 1, height: '44px', marginTop: 0, borderRadius: '12px', border: 'none', bg: 'ws.sakuraDark', color: 'white', _disabled: { opacity: 0.45, cursor: 'not-allowed' } });

// Auth-only RGPD erasure; guests have no server account.
export function EraseData() {
  const { state, refresh } = useAuth();
  const { authClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (state.status !== 'authed') return null;
  const name = state.whoami.displayName;
  const canConfirm = typed.trim() === name && !deleting;

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setFailed(false);
  };
  const confirm = async () => {
    if (!authClient || !canConfirm) return;
    setDeleting(true);
    setFailed(false);
    try {
      await authClient.deleteMe();
    } catch (cause) {
      console.warn('deleteMe failed', cause);
      setFailed(true);
      setDeleting(false);
      return;
    }
    try {
      await refresh();
    } catch {
      // Erase succeeded but the session refresh didn't: hard-navigate so no stale auth chrome survives.
      window.location.href = '/';
      return;
    }
    void navigate({ to: '/' });
  };

  return (
    <>
      <button type="button" className={dangerBtn} onClick={() => setOpen(true)}>
        Effacer mes données
      </button>
      <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) close(); }} modal closeOnEscape closeOnInteractOutside preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={positioner}>
            <Dialog.Content className={card}>
              <Dialog.Title className={dlgTitle}>Effacer mes données</Dialog.Title>
              <Dialog.Description className={dlgDesc}>
                Cette action est définitive et irréversible. Tape ton pseudonyme (<strong>{name}</strong>) pour confirmer.
              </Dialog.Description>
              <input
                className={input}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Confirmation du pseudonyme"
                disabled={deleting}
              />
              {failed ? <p role="alert" className={errText}>La suppression a échoué. Réessaie.</p> : null}
              <div className={dlgActions}>
                <button type="button" className={ghostBtn} onClick={close} disabled={deleting}>
                  Annuler
                </button>
                <button type="button" className={cx(dangerBtn, confirmBtn)} onClick={() => void confirm()} disabled={!canConfirm}>
                  {deleting ? 'Suppression…' : 'Effacer définitivement'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
