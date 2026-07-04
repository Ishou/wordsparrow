import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { AuthClient } from '@/application/auth';

const emailAuthEnabled = import.meta.env.VITE_FEATURE_EMAIL_AUTH === 'true';

// Real anchor — Phase 5 §User flows. A `<button>` + `window.location.assign`
// loses the navigation semantics the browser needs to follow the 302 chain
// and accept the Set-Cookie at the identity-api callback.
const signInLinkStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: 'sm',
  paddingBlock: '4px',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'medium',
  color: 'fg',
  textDecoration: 'none',
  border: '1px solid token(colors.gridLine)',
  borderRadius: 'md',
  bg: 'surface',
  transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
  _hover: { borderColor: 'accent' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const signInWrapStyles = css({ display: 'inline-flex', alignItems: 'center', gap: 'xs' });

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

// ADR-0082 "Transparency": the sign-in surface must disclose email collection.
const disclosureLinkStyles = css({
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

export interface SignInButtonProps {
  readonly authClient: AuthClient;
}

// returnTo is computed post-hydration so the prerender HTML doesn't bake the local preview URL.
export function SignInButton({ authClient }: SignInButtonProps) {
  const [returnTo, setReturnTo] = useState<string>('');
  const [returnPath, setReturnPath] = useState<string>('/');
  useEffect(() => {
    setReturnTo(window.location.href);
    setReturnPath(window.location.pathname + window.location.search);
  }, []);
  const href = returnTo ? authClient.signInUrl('google', returnTo) : '#';
  return (
    <span className={signInWrapStyles}>
      <a
        className={signInLinkStyles}
        href={href}
        aria-disabled={returnTo ? undefined : true}
      >
        Se connecter
      </a>
      {emailAuthEnabled ? (
        <Link to="/connexion" search={{ returnTo: returnPath }} className={emailLinkStyles}>
          … ou avec ton e-mail
        </Link>
      ) : null}
      <a href="/confidentialite" className={disclosureLinkStyles}>
        Confidentialité
      </a>
    </span>
  );
}
