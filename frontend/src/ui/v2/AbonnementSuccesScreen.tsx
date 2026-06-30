import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { CircleNotch } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const statusCard = css({ display: 'flex', alignItems: 'center', gap: '10px', bg: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: '0 0 18px' });
const spin = css({ flexShrink: 0, animation: 'wsSpin 0.7s linear infinite', color: 'ws.jade' });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for coloured text — known palette gotcha.
const linkStyle = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', textDecoration: 'underline' });

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
    <PhoneShell header={<BackHeader to="/menu" />} backTo="/menu">
      <h1 className={title}>Abonnement</h1>
      {children}
    </PhoneShell>
  );
}

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
    <SuccesShell>
      {phase === 'active' ? (
        <p className={statusCard} role="status">
          Ton abonnement est actif — merci ! Tu débloques toutes les grilles et la génération.
        </p>
      ) : phase === 'timeout' ? (
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
      <Link to="/abonnement" className={linkStyle}>
        Revenir à mon abonnement
      </Link>
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
        <p className={statusCard} role="status">
          L'abonnement n'est pas disponible pour le moment.
        </p>
      </SuccesShell>
    );
  }
  return <CheckoutSuccessScreen client={billingClient} />;
}
