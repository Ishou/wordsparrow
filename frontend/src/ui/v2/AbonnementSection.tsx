import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Sparkle } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { BillingError, type BillingClient, type SubscriptionView } from '@/application/billing';
import { useSubscription } from '@/ui/components/billing';
import { useBillingGate } from './useBillingGate';

type Etat = 'free' | 'actif' | 'pending' | 'expire';

const groupLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#543C00', margin: '0 6px 7px' });
const cardWrap = css({ bg: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)' });
const summary = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '15px 15px 13px' });
const markTile = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', bg: 'ws.sakuraBlush', color: 'ws.sakuraDark', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const sumMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' });
const tierLine = css({ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
const tierName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const periodLine = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9 });

const pill = css({ fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: '999px', padding: '3px 8px' });
const pillActif = css({ color: 'ws.clueSurface', bg: 'ws.jade' });
const pillPending = css({ color: '#5A4B12', bg: 'ws.or' });
const pillMuted = css({ color: 'ws.khaki', bg: 'rgba(33,75,64,0.08)' });

const divider = css({ height: '1px', bg: '#EEF3EC' });
const cancelRow = css({ display: 'flex', alignItems: 'center', width: '100%', minHeight: '50px', padding: '11px 15px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '14px', color: 'ws.sakuraDark', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' } });

const actionPad = css({ padding: '13px 15px 16px', display: 'flex', flexDirection: 'column', gap: '9px' });
const note = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.4' });
const inlineError = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.sakuraDark', lineHeight: '1.4' });
const primaryLink = css({ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', padding: '13px', borderRadius: '13px', boxShadow: '0 8px 18px rgba(190,73,112,0.30)' });
const loadingRow = css({ padding: '16px 15px', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85 });

// fixed cancel confirmation dialog --------------------------------------
// Above PhoneShell's sticky DesktopAppBar (z-50) so the confirmation overlays the chrome.
const scrim = css({ position: 'fixed', inset: 0, zIndex: 100, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out' });
const dialogPos = css({ position: 'fixed', inset: 0, zIndex: 101, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
const dialog = css({ width: '100%', maxWidth: '360px', bg: 'white', borderRadius: '20px', padding: '20px 18px', boxShadow: '0 18px 40px rgba(20,40,34,0.28)', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center', animation: 'wsFade 180ms ease-out' });
const dTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '18px', color: 'ws.jadeInk', margin: 0 });
const dText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.45' });
const dConfirm = css({ width: '100%', border: '1.6px solid token(colors.ws.sakuraDark)', bg: 'transparent', color: 'ws.sakuraDark', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14.5px', padding: '12px', borderRadius: '13px', cursor: 'pointer', _disabled: { opacity: 0.6, cursor: 'default' } });
const dKeep = css({ width: '100%', border: 'none', bg: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '6px', cursor: 'pointer' });

function etatFor(subscription: SubscriptionView | null): Etat {
  if (!subscription) return 'free';
  switch (subscription.status) {
    case 'active':
      return 'actif';
    case 'pending_cancellation':
      return 'pending';
    // billing spells the ended state 'canceled' (one l); accept both.
    case 'expired':
    case 'canceled':
      return 'expire';
    default:
      return 'free';
  }
}

const TIER_LABEL: Record<Etat, string> = { actif: 'Accès complet', pending: 'Accès complet', expire: 'Version gratuite', free: 'Version gratuite' };

function periodDateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function periodLabelFor(etat: Etat, periodEnd: string | null): string | null {
  if (periodEnd === null) return null;
  const date = periodDateFr(periodEnd);
  if (etat === 'actif') return `Renouvellement le ${date}`;
  if (etat === 'pending') return `Accès actif jusqu'au ${date}`;
  if (etat === 'expire') return `Terminé le ${date}`;
  return null;
}

function StatusPill({ etat }: { readonly etat: Etat }) {
  if (etat === 'actif') return <span className={cx(pill, pillActif)}>Actif</span>;
  if (etat === 'pending') return <span className={cx(pill, pillPending)}>Résiliation programmée</span>;
  if (etat === 'expire') return <span className={cx(pill, pillMuted)}>Terminé</span>;
  return <span className={cx(pill, pillMuted)}>Sans abonnement</span>;
}

function cancelErrorMessage(error: unknown): string {
  if (error instanceof BillingError && error.kind === 'no-active-subscription') {
    return "Tu n'as pas d'abonnement actif à résilier.";
  }
  return 'La résiliation a échoué. Réessaie dans un instant.';
}

function AbonnementPanel({ client }: { readonly client: BillingClient }) {
  const { subscription, loading, error, refetch } = useSubscription(client);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (confirming) setCancelError(null);
  }, [confirming]);

  async function confirmCancel() {
    setCanceling(true);
    setCancelError(null);
    try {
      await client.cancelSubscription();
      setConfirming(false);
      refetch();
    } catch (cause) {
      setCancelError(cancelErrorMessage(cause));
    } finally {
      setCanceling(false);
    }
  }

  // No subscription is a 404 (no-active-subscription), not a failure: that's the free état.
  const noSubscription = error instanceof BillingError && error.kind === 'no-active-subscription';
  const loadFailed = error !== null && !noSubscription;
  const etat = noSubscription ? 'free' : etatFor(subscription);
  const periodLabel = periodLabelFor(etat, subscription?.periodEnd ?? null);

  return (
    <nav aria-label="Ton abonnement">
      <div className={groupLabel}>Ton abonnement</div>
      <div className={cardWrap}>
        {loading ? (
          <div className={loadingRow} role="status" aria-busy="true">
            Chargement de ton abonnement…
          </div>
        ) : loadFailed ? (
          <div className={actionPad}>
            <p className={inlineError} role="status">
              Impossible de charger ton abonnement pour le moment.
            </p>
          </div>
        ) : (
          <>
            <div className={summary}>
              <span className={markTile}>
                <Sparkle size={20} weight="fill" aria-hidden="true" />
              </span>
              <span className={sumMid}>
                <span className={tierLine}>
                  <span className={tierName}>{TIER_LABEL[etat]}</span>
                  <StatusPill etat={etat} />
                </span>
                {periodLabel !== null ? <span className={periodLine}>{periodLabel}</span> : null}
              </span>
            </div>

            {etat === 'actif' ? (
              <>
                <div className={divider} />
                <button type="button" className={cancelRow} onClick={() => setConfirming(true)}>
                  Résilier l&apos;abonnement
                </button>
              </>
            ) : null}

            {etat === 'pending' ? (
              <div className={actionPad}>
                <p className={note}>
                  Tu gardes l&apos;accès jusqu&apos;à la fin de la période. Rien ne te sera plus
                  prélevé ensuite.
                </p>
              </div>
            ) : null}

            {etat === 'expire' ? (
              <div className={actionPad}>
                <p className={note}>
                  Ton abonnement est terminé. Tu gardes la grille du jour et les 7 derniers jours.
                </p>
                <Link to="/abonnement" className={primaryLink}>
                  Se réabonner
                </Link>
              </div>
            ) : null}

            {etat === 'free' ? (
              <div className={actionPad}>
                <p className={note}>
                  Tu joues avec la version gratuite. L&apos;abonnement débloque toutes les grilles et
                  la génération.
                </p>
                <Link to="/abonnement" className={primaryLink}>
                  Découvre l&apos;abonnement
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>

      {confirming ? (
        <>
          <button type="button" className={scrim} aria-label="Fermer" onClick={() => setConfirming(false)} />
          <div className={dialogPos}>
            <div className={dialog} role="dialog" aria-modal="true" aria-label="Résilier ton abonnement">
              <h2 className={dTitle}>Résilier ton abonnement ?</h2>
              <p className={dText}>
                Tu gardes l&apos;accès jusqu&apos;à la fin de la période en cours. Rien ne te sera
                plus prélevé ensuite — tu pourras te réabonner quand tu veux.
              </p>
              {cancelError !== null ? (
                <p className={inlineError} role="alert">
                  {cancelError}
                </p>
              ) : null}
              <button type="button" className={dConfirm} disabled={canceling} onClick={() => void confirmCancel()}>
                {canceling ? 'Résiliation…' : 'Oui, résilier'}
              </button>
              <button type="button" className={dKeep} onClick={() => setConfirming(false)}>
                Annuler
              </button>
            </div>
          </div>
        </>
      ) : null}
    </nav>
  );
}

// "Ton abonnement" manage section; gated like the other abonnement surfaces (cosmetic — server enforces, ADR-0078).
export function AbonnementSection({ client }: { readonly client: BillingClient }) {
  const gate = useBillingGate();
  if (gate !== 'allowed') return null;
  return <AbonnementPanel client={client} />;
}
