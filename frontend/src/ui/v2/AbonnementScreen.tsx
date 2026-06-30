import { useCallback, useState, type ReactNode } from 'react';
import { useRouteContext } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { useSubscription } from '@/ui/components/billing';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 12px' });
const lede = css({ fontFamily: 'wsUi', fontSize: '14px', lineHeight: '1.5', color: 'ws.khaki', margin: '0 0 18px' });
const statusCard = css({ bg: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: '0 0 18px' });
const actions = css({ display: 'flex', flexDirection: 'column', gap: '10px' });
const primaryBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '50px', borderRadius: '14px', border: 'none', bg: 'ws.jadeInk', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', cursor: 'pointer', _hover: { opacity: 0.92 }, _disabled: { opacity: 0.45, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const secondaryBtn = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '50px', borderRadius: '14px', border: 'none', bg: 'ws.sable', color: 'ws.jadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', cursor: 'pointer', _hover: { bg: '#DED7BC' }, _disabled: { opacity: 0.45, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for coloured text — known palette gotcha.
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: '14px 0 0' });

// Active until period end; pending_cancellation still grants access so it hides the subscribe CTA.
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'pending_cancellation']);
function hasActiveAccess(subscription: SubscriptionView | null): boolean {
  return subscription !== null && ACTIVE_STATUSES.has(subscription.status);
}
function canCancel(subscription: SubscriptionView | null): boolean {
  return subscription !== null && subscription.status === 'active';
}

const ERROR_MESSAGE_BY_KIND: Readonly<Record<string, string>> = {
  'already-subscribed': 'Tu as déjà un abonnement actif.',
  'no-active-subscription': "Tu n'as aucun abonnement actif à résilier.",
  'auth-required': 'Connecte-toi pour gérer ton abonnement.',
  'provider-unavailable': 'Le service de paiement est momentanément indisponible. Réessaie dans un instant.',
  'rate-limited': 'Trop de tentatives. Réessaie dans un instant.',
};
function messageFor(error: unknown): string {
  if (error instanceof BillingError) {
    return ERROR_MESSAGE_BY_KIND[error.kind] ?? 'Une erreur est survenue. Réessaie.';
  }
  return 'Une erreur est survenue. Réessaie.';
}

function formatPeriodEnd(periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  const date = new Date(periodEnd);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function GateShell({ children }: { readonly children: ReactNode }) {
  return (
    <PhoneShell header={<BackHeader to="/menu" />} backTo="/menu">
      <h1 className={title}>Abonnement</h1>
      {children}
    </PhoneShell>
  );
}

export function AbonnementManage({ client }: { readonly client: BillingClient }) {
  const { subscription, loading, error, refetch } = useSubscription(client);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onSubscribe = useCallback(async () => {
    setActionError(null);
    setPending(true);
    try {
      const session = await client.createCheckoutSession('premium');
      window.location.assign(session.checkoutUrl);
    } catch (cause) {
      setActionError(messageFor(cause));
      setPending(false);
    }
  }, [client]);

  const onCancel = useCallback(async () => {
    setActionError(null);
    setPending(true);
    try {
      await client.cancelSubscription();
      refetch();
    } catch (cause) {
      setActionError(messageFor(cause));
    } finally {
      setPending(false);
    }
  }, [client, refetch]);

  const periodEnd = formatPeriodEnd(subscription?.periodEnd ?? null);

  return (
    <GateShell>
      <p className={lede}>
        WordSparrow reste gratuit : la grille du jour, les sept derniers jours et tes grilles
        commencées le resteront toujours. Premium débloque toutes les grilles et la génération,
        et soutient le projet.
      </p>

      {loading ? (
        <p className={statusCard} role="status">
          Chargement de ton abonnement…
        </p>
      ) : error ? (
        <p className={statusCard} role="alert">
          Impossible de charger ton abonnement pour le moment.
        </p>
      ) : hasActiveAccess(subscription) ? (
        <p className={statusCard}>
          Ton offre : Premium — actif{periodEnd ? ` jusqu'au ${periodEnd}` : ''}.
        </p>
      ) : (
        <p className={statusCard}>Tu joues avec l'offre gratuite.</p>
      )}

      <div className={actions}>
        {hasActiveAccess(subscription) ? null : (
          <button type="button" className={primaryBtn} onClick={() => void onSubscribe()} disabled={pending || loading}>
            S'abonner (test)
          </button>
        )}
        {canCancel(subscription) ? (
          <button type="button" className={secondaryBtn} onClick={() => void onCancel()} disabled={pending || loading}>
            Résilier
          </button>
        ) : null}
      </div>

      {actionError ? (
        <p className={errText} role="alert">
          {actionError}
        </p>
      ) : null}
    </GateShell>
  );
}

export function AbonnementScreen() {
  const gate = useBillingGate();
  const { billingClient } = useRouteContext({ from: '__root__' });
  if (gate === 'loading') return <GateLoadingScreen />;
  if (gate === 'denied') return <NotFoundScreen />;
  if (!billingClient) {
    return (
      <GateShell>
        <p className={statusCard} role="status">
          L'abonnement n'est pas disponible pour le moment.
        </p>
      </GateShell>
    );
  }
  return <AbonnementManage client={billingClient} />;
}
