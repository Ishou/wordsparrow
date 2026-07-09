import { useEffect, useRef, useState } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { canNativeShare, shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';
import { t } from '@/ui/i18n';

// Per-row "re-share the invitation" affordance for the multiplayer game
// lists. Native share sheet when the platform has one, clipboard copy
// otherwise (shareInvite). Rendered as a standalone control outside the
// row's navigate `Link` so tapping it copies and never navigates.

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
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const wrapStyles = css({ display: 'inline-flex', alignItems: 'center', gap: '4px' });

const feedbackStyles = css({ fontSize: 'xs', color: 'ws.jadeInk' });

const COPY_FEEDBACK_MS = 2000;

export function ShareInviteButton({ code }: { readonly code: string }) {
  const [justCopied, setJustCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const handleShare = () => {
    // ADR-0027: the invite URL is `/join/<code>`, not the bare code.
    const shareUrl = `${window.location.origin}/join/${code}`;
    void (async () => {
      const result = await shareOrCopyInviteUrl(shareUrl);
      if (result !== 'copied') return;
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      setJustCopied(true);
      copyTimerRef.current = setTimeout(() => {
        setJustCopied(false);
        copyTimerRef.current = null;
      }, COPY_FEEDBACK_MS);
    })();
  };

  return (
    <span className={wrapStyles}>
      <button
        type="button"
        className={triggerStyles}
        aria-label={canNativeShare() ? t('lobby.myLobbies.aria.share') : t('lobby.myLobbies.aria.copy')}
        onClick={(event) => {
          // The button lives inside a tappable row card; never let it navigate.
          event.stopPropagation();
          handleShare();
        }}
      >
        <ShareNetwork size={18} weight="bold" aria-hidden="true" />
      </button>
      <span role="status" aria-live="polite" className={feedbackStyles}>
        {justCopied ? t('lobby.myLobbies.copied') : ''}
      </span>
    </span>
  );
}
