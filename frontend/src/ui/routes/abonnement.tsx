import { useCallback, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { ContentPage } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { useCapability, useSubscription } from '@/ui/components/billing';
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
const statusStyles = css({ fontSize: 'body', color: 'fg', fontWeight: 'medium', margin: 0 });
const actionsStyles = css({ display: 'flex', flexWrap: 'wrap', gap: 'md' });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for white-on-colour — known palette gotcha.
const errorStyles = css({ fontSize: 'body', color: 'ws.sakuraDark', fontWeight: 'medium', margin: 0 });

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

export function AbonnementScreen({ client }: { readonly client: BillingClient }) {
  const { subscription, loading, error, refetch } = useSubscription(client);
  const canSubscribe = useCapability('billing:subscribe');
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
    <article className={articleStyles}>
      <h1 className={headingStyles}>Abonnement</h1>
      <p className={leadStyles}>
        WordSparrow reste gratuit : la grille du jour, les sept derniers jours et tes grilles
        commencées le resteront toujours. Premium débloque toutes les grilles et la génération,
        et soutient le projet.
      </p>

      {loading ? (
        <p className={statusStyles} role="status">
          Chargement de ton abonnement…
        </p>
      ) : error ? (
        <p className={errorStyles} role="alert">
          Impossible de charger ton abonnement pour le moment.
        </p>
      ) : hasActiveAccess(subscription) ? (
        <p className={statusStyles}>
          Ton offre : Premium — actif{periodEnd ? ` jusqu'au ${periodEnd}` : ''}.
        </p>
      ) : (
        <p className={statusStyles}>Tu joues avec l'offre gratuite.</p>
      )}

      <div className={actionsStyles}>
        {canSubscribe && !hasActiveAccess(subscription) ? (
          <Button type="button" onClick={onSubscribe} disabled={pending || loading}>
            S'abonner (test)
          </Button>
        ) : null}
        {canCancel(subscription) ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending || loading}>
            Résilier
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p className={errorStyles} role="alert">
          {actionError}
        </p>
      ) : null}
    </article>
  );
}

function AbonnementRouteComponent() {
  const { billingClient } = Route.useRouteContext();
  return (
    <ContentPage>
      {billingClient ? (
        <AbonnementScreen client={billingClient} />
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
  path: 'abonnement',
  component: AbonnementRouteComponent,
  head: () => noindexHead('Abonnement — WordSparrow', 'Gère ton abonnement WordSparrow.'),
});
