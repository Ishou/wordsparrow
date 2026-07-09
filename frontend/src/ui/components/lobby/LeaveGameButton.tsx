import { useState } from 'react';
import { SignOut, Trash } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Button, Dialog, DialogDescription, useToast } from '@/ui/components/primitives';
import { t } from '@/ui/i18n';

// Per-row "quitter / supprimer" affordance for the multiplayer game lists
// (ADR-0098 §6, 2026-07-08 amendment). The server decides delete-vs-leave;
// the client only reads `playerCount` to pick the icon and confirm copy —
// a trash icon when the caller is alone (the game is destroyed) and a
// leave icon otherwise. Always confirms via the accessible Dialog
// primitive (role=dialog, focus-trap, Escape — ADR-0050). Rendered as a
// standalone control outside the row's navigate `Link` so tapping it never
// triggers navigation.

const triggerStyles = css({
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '34px',
  height: '34px',
  borderRadius: '10px',
  bg: 'transparent',
  color: 'ws.khaki',
  border: 'none',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
  _hover: { bg: 'ws.sable', color: 'ws.jadeInk' },
  // Inset offset (mirrors listRowStyles `card`) so the ring is not clipped by the row's overflow.
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});

const actionsStyles = css({
  display: 'flex',
  flexDirection: 'row-reverse',
  gap: 'sm',
  justifyContent: 'flex-start',
});

export function LeaveGameButton({
  playerCount,
  onConfirm,
}: {
  readonly playerCount: number;
  readonly onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { show: showToast } = useToast();
  const willDelete = playerCount <= 1;

  const handleConfirm = () => {
    if (pending) return;
    setPending(true);
    Promise.resolve(onConfirm())
      .then(() => {
        setPending(false);
        setOpen(false);
      })
      .catch(() => {
        // Keep the dialog open for a retry; the copy tracks delete-vs-leave.
        showToast({ text: willDelete ? t('lobby.delete.error') : t('lobby.leave.error'), tone: 'error' });
        setPending(false);
      });
  };

  return (
    <>
      <button
        type="button"
        className={triggerStyles}
        disabled={pending}
        aria-label={willDelete ? t('lobby.leave.aria.delete') : t('lobby.leave.aria.leave')}
        onClick={(event) => {
          // The button lives inside a tappable row card; never let it navigate.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {willDelete ? (
          <Trash size={18} weight="bold" aria-hidden="true" />
        ) : (
          <SignOut size={18} weight="bold" aria-hidden="true" />
        )}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={willDelete ? t('lobby.leave.confirm.deleteTitle') : t('lobby.leave.confirm.leaveTitle')}
      >
        <DialogDescription>
          {willDelete ? t('lobby.leave.confirm.deleteBody') : t('lobby.leave.confirm.leaveBody')}
        </DialogDescription>
        <div className={actionsStyles}>
          <Button variant="primary" onClick={handleConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending
              ? t('lobby.leave.processing')
              : willDelete
                ? t('lobby.leave.confirm.delete')
                : t('lobby.leave.confirm.leave')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t('lobby.leave.confirm.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
