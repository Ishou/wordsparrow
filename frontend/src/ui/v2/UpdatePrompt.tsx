import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';

// Decouples infrastructure/ from ui/: composition root pushes updates in; component subscribes. See ADR-0026.
type ApplyUpdate = () => void;
let pendingApply: ApplyUpdate | null = null;
let subscriber: ((apply: ApplyUpdate) => void) | null = null;

export function signalUpdateAvailable(apply: ApplyUpdate): void {
  pendingApply = apply;
  subscriber?.(apply);
}

const banner = css({
  position: 'fixed',
  insetInline: 'md',
  bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
  marginInline: 'auto',
  maxWidth: '420px',
  zIndex: 120,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  paddingBlock: '12px',
  paddingInline: '16px',
  bg: 'ws.frost',
  backdropFilter: 'blur(14px)',
  borderRadius: '16px',
  border: '0.5px solid rgba(33,75,64,0.12)',
  boxShadow: '0 8px 28px rgba(33,75,64,0.18)',
  fontFamily: 'wsUi',
});

const message = css({
  flex: '1',
  margin: 0,
  fontSize: '14px',
  fontWeight: 'medium',
  lineHeight: 1.35,
  color: 'ws.jadeInk',
});

const updateButton = css({
  flexShrink: 0,
  paddingBlock: '8px',
  paddingInline: '14px',
  fontFamily: 'wsUi',
  fontSize: '13px',
  fontWeight: 'bold',
  color: 'ws.clueText',
  _dark: { color: '#16241D' },
  bg: 'ws.jadeInk',
  border: 'none',
  borderRadius: '999px',
  cursor: 'pointer',
  _hover: { opacity: 0.92 },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const dismissButton = css({
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
  width: '28px',
  height: '28px',
  fontSize: '16px',
  lineHeight: 1,
  color: 'ws.khaki',
  bg: 'transparent',
  border: 'none',
  borderRadius: '999px',
  cursor: 'pointer',
  _hover: { bg: 'rgba(33,75,64,0.08)' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

export function UpdatePrompt() {
  const [apply, setApply] = useState<ApplyUpdate | null>(() => pendingApply);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    subscriber = (next) => {
      // Re-show on a fresh waiting SW even if the player dismissed an earlier one.
      setDismissed(false);
      setApply(() => next);
    };
    return () => { subscriber = null; };
  }, []);

  if (apply == null || dismissed) return null;

  return (
    <div className={banner} role="status" aria-live="polite" data-testid="pwa-update-prompt">
      <p className={message}>Nouvelle version disponible</p>
      <button type="button" className={updateButton} onClick={apply}>
        Mettre à jour
      </button>
      <button
        type="button"
        className={dismissButton}
        onClick={() => setDismissed(true)}
        aria-label="Ignorer la mise à jour"
      >
        ✕
      </button>
    </div>
  );
}
