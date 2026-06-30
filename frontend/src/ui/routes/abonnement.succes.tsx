import { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { ContentPage } from '@/ui/components/layout';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

const articleStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'lg',
  width: '100%',
  maxWidth: '720px',
});
const headingStyles = css({
  fontSize: { base: 'xl', md: 'display' },
  fontWeight: 'bold',
  letterSpacing: '-0.02em',
  margin: 0,
  color: 'fg',
});
const leadStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });
const statusStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'sm',
  fontSize: 'body',
  color: 'fg',
  fontWeight: 'medium',
  margin: 0,
});
const spinnerStyles = css({
  width: '1.1em',
  height: '1.1em',
  flexShrink: 0,
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border',
  borderTopColor: 'ws.sakuraDark',
  borderRadius: 'full',
  animation: 'wsSpin 0.7s linear infinite',
});
// ws.sakuraDark (not ws.sakura) clears WCAG AA for white-on-colour — known palette gotcha.
const linkStyles = css({
  fontSize: 'body',
  color: 'ws.sakuraDark',
  fontWeight: 'medium',
  textDecoration: 'underline',
});

// Active (or pending_cancellation) means access is granted; matches the manage screen's predicate.
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'pending_cancellation']);
function hasActiveAccess(subscription: SubscriptionView | null): boolean {
  return subscription !== null && ACTIVE_STATUSES.has(subscription.status);
}

// Mollie confirms the payment asynchronously via webhook (ADR-0078), so the tier lags the redirect by a few seconds.
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 5;

type ConfirmPhase = 'confirming' | 'active' | 'timeout';

export function CheckoutSuccessScreen({ client }: { readonly client: BillingClient }) {
  const [phase, setPhase] = useState<ConfirmPhase>('confirming');

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      let active = false;
      try {
        active = hasActiveAccess(await client.getSubscription());
      } catch {
        // Transient errors while the webhook is in flight don't end the poll; the cap does.
      }
      if (cancelled) return;
      if (active) {
        setPhase('active');
        clearInterval(intervalId);
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setPhase('timeout');
        clearInterval(intervalId);
      }
    };
    const intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [client]);

  return (
    <article className={articleStyles}>
      <h1 className={headingStyles}>Abonnement</h1>

      {phase === 'active' ? (
        <p className={statusStyles} role="status">
          Ton abonnement est actif — merci ! Tu débloques toutes les grilles et la génération.
        </p>
      ) : phase === 'timeout' ? (
        <p className={statusStyles} role="status">
          La confirmation prend plus de temps que prévu. Aucune action n'est nécessaire : ton accès
          s'activera dès que le paiement sera confirmé.
        </p>
      ) : (
        <p className={statusStyles} role="status">
          <span className={spinnerStyles} aria-hidden="true" />
          Paiement reçu, confirmation en cours…
        </p>
      )}

      <p className={leadStyles}>
        <Link to="/abonnement" className={linkStyles}>
          Revenir à mon abonnement
        </Link>
      </p>
    </article>
  );
}

function CheckoutSuccessRouteComponent() {
  const { billingClient } = Route.useRouteContext();
  return (
    <ContentPage>
      {billingClient ? (
        <CheckoutSuccessScreen client={billingClient} />
      ) : (
        <article className={articleStyles}>
          <h1 className={headingStyles}>Abonnement</h1>
          <p className={statusStyles} role="status">
            L'abonnement n'est pas disponible pour le moment.
          </p>
        </article>
      )}
    </ContentPage>
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/succes',
  component: CheckoutSuccessRouteComponent,
  head: () =>
    noindexHead('Merci — WordSparrow', 'Confirmation de ton abonnement WordSparrow.'),
});
