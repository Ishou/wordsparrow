import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { CircleNotch } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { SparrowMark } from '@/design-system';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const statusCard = css({ display: 'flex', alignItems: 'center', gap: '10px', bg: 'ws.card', borderRadius: '18px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: '0 0 18px' });
const spin = css({ flexShrink: 0, animation: 'wsSpin 0.7s linear infinite', color: 'ws.jade' });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for coloured text — known palette gotcha.
const linkStyle = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', textDecoration: 'underline' });

const merci = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px', paddingTop: '12px' });
const merciMark = css({ marginBottom: '2px' });
const merciKicker = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'ws.sakuraDark' });
const merciTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.12', color: 'ws.jadeInk', margin: 0 });
const merciText = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.45', maxWidth: '280px' });
const merciCta = css({ display: 'block', width: '100%', maxWidth: '300px', textAlign: 'center', textDecoration: 'none', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '16px', padding: '14px', borderRadius: '14px', boxShadow: '0 8px 18px rgba(190,73,112,0.34)', marginTop: '4px' });

const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'pending_cancellation']);
function hasActiveAccess(subscription: SubscriptionView | null): boolean {
  return subscription !== null && ACTIVE_STATUSES.has(subscription.status);
}

// Mollie confirms the payment asynchronously via webhook (ADR-0078), so the tier lags the redirect by a few seconds.
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 5;

type ConfirmPhase = 'confirming' | 'active' | 'timeout';

function SuccesShell({ children }: { readonly children: ReactNode }) {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      {children}
    </PhoneShell>
  );
}

// hasEmail gates the receipt line — pre-W2 sessions may have no email on file (ADR-0082).
function MerciConfirmation({ hasEmail }: { readonly hasEmail: boolean }) {
  return (
    <div className={merci}>
      <div className={merciMark}>
        <SparrowMark size={84} colorway="sakura" tile="dark" />
      </div>
      <span className={merciKicker}>Abonnement activé</span>
      <h1 className={merciTitle}>Te voilà abonné·e !</h1>
      <p className={merciText}>
        Toutes les grilles sont à toi, et tu peux en générer de nouvelles quand tu veux.
      </p>
      {hasEmail ? <p className={merciText}>Un reçu te sera envoyé par e-mail.</p> : null}
      <Link to="/grilles" className={merciCta}>
        Découvrir toutes les grilles
      </Link>
    </div>
  );
}

export function CheckoutSuccessScreen({ client }: { readonly client: BillingClient }) {
  const { authClient } = useRouteContext({ from: '__root__' });
  const [phase, setPhase] = useState<ConfirmPhase>('confirming');
  const [hasEmail, setHasEmail] = useState(false);

  useEffect(() => {
    if (!authClient) return;
    let cancelled = false;
    authClient.getMe().then((me) => {
      if (!cancelled) setHasEmail(Boolean(me.email));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authClient]);

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

  if (phase === 'active') {
    return (
      <SuccesShell>
        <MerciConfirmation hasEmail={hasEmail} />
      </SuccesShell>
    );
  }

  return (
    <SuccesShell>
      <h1 className={title}>Abonnement</h1>
      {phase === 'timeout' ? (
        <p className={statusCard} role="status">
          La confirmation prend plus de temps que prévu. Aucune action n'est nécessaire : ton accès
          s'activera dès que le paiement sera confirmé.
        </p>
      ) : (
        <p className={statusCard} role="status">
          <CircleNotch size={20} weight="bold" aria-hidden="true" className={spin} />
          Paiement reçu, confirmation en cours…
        </p>
      )}
      {phase === 'timeout' ? (
        <Link to="/compte" className={linkStyle}>
          Retour à mon compte
        </Link>
      ) : (
        <Link to="/abonnement" className={linkStyle}>
          Revenir à mon abonnement
        </Link>
      )}
    </SuccesShell>
  );
}

export function AbonnementSuccesScreen() {
  const gate = useBillingGate();
  const { billingClient } = useRouteContext({ from: '__root__' });
  if (gate === 'loading') return <GateLoadingScreen />;
  if (gate === 'denied') return <NotFoundScreen />;
  if (!billingClient) {
    return (
      <SuccesShell>
        <h1 className={title}>Abonnement</h1>
        <p className={statusCard} role="status">
          L'abonnement n'est pas disponible pour le moment.
        </p>
      </SuccesShell>
    );
  }
  return <CheckoutSuccessScreen client={billingClient} />;
}
