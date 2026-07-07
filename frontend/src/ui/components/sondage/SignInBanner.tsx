// Anon visitor sign-in banner for /sondage — OAuth href mirrors SignInButton.

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { AuthClient } from '@/application/auth';
import { t } from '@/ui/i18n';

const emailAuthEnabled = import.meta.env.VITE_FEATURE_EMAIL_AUTH === 'true';

const bannerStyles = css({
  display: 'flex',
  flexDirection: { base: 'column', md: 'row' },
  alignItems: { base: 'flex-start', md: 'center' },
  gap: 'sm',
  paddingBlock: 'sm',
  paddingInline: 'md',
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'md',
  color: 'fg',
});

const textStyles = css({
  fontSize: 'body',
  flex: 1,
});

// ADR-0082 "Transparency": the sign-in surface must disclose email collection.
const disclosureStyles = css({
  display: 'block',
  fontSize: 'xs',
  color: 'fgMuted',
  marginTop: 'xs',
});

const ctaStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: 'sm',
  paddingBlock: '6px',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  color: 'onAccent',
  bg: 'accent',
  border: 'none',
  borderRadius: '6px',
  textDecoration: 'none',
  cursor: 'pointer',
  _hover: { bg: 'primary.400' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  '&[aria-disabled="true"]': { opacity: 0.6, cursor: 'not-allowed' },
});

const emailLinkStyles = css({
  fontFamily: 'body',
  fontSize: 'xxs',
  fontWeight: 'medium',
  color: 'fgMuted',
  textDecoration: 'underline',
  _hover: { color: 'fg' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: '2px',
  },
});

export interface SignInBannerProps {
  readonly authClient: AuthClient;
  readonly onClick: () => void;
}

export function SignInBanner({ authClient, onClick }: SignInBannerProps) {
  // Compute returnTo post-hydration so prerender HTML doesn't bake a stale URL.
  const [returnTo, setReturnTo] = useState('');
  const [returnPath, setReturnPath] = useState('/');
  useEffect(() => {
    setReturnTo(window.location.href);
    setReturnPath(window.location.pathname + window.location.search);
  }, []);
  const href = returnTo ? authClient.signInUrl('google', returnTo) : '#';

  return (
    <aside className={bannerStyles} role="note" aria-label={t('sondage.signIn.aria.banner')}>
      <p className={textStyles}>
        {t('sondage.signIn.text')}
        <span className={disclosureStyles}>
          {t('sondage.signIn.disclosure')}
        </span>
      </p>
      <a
        className={ctaStyles}
        href={href}
        aria-disabled={returnTo ? undefined : true}
        onClick={onClick}
      >
        {t('sondage.signIn.cta')}
      </a>
      {emailAuthEnabled ? (
        <Link to="/connexion" search={{ returnTo: returnPath }} className={emailLinkStyles}>
          {t('sondage.signIn.emailLink')}
        </Link>
      ) : null}
    </aside>
  );
}
