import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Sparkle } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { pill, pillMuted, pillPending, pillWarn } from './statusPill';
import { t, type MessageKey } from '@/ui/i18n';
import { BillingError, type BillingClient, type SubscriptionView } from '@/application/billing';
import { useSubscription } from '@/ui/components/billing';
import { Dialog, DialogDescription } from '@/ui/components/primitives';
import { useBillingGate } from './useBillingGate';

type Etat = 'free' | 'actif' | 'pending' | 'expire' | 'past_due';

const groupLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'ws.eyebrow', margin: '0 6px 7px' });
const cardWrap = css({ bg: 'ws.card', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)' });
const summary = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '15px 15px 13px' });
const markTile = css({ flex: 'none', width: '44px', height: '44px', borderRadius: '12px', bg: 'ws.sakuraBlush', color: 'ws.sakuraDark', display: 'flex', alignItems: 'center', justifyContent: 'center' });
const sumMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' });
const tierLine = css({ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
const tierName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const periodLine = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9 });

const pillActif = css({ color: 'ws.onJadeInk', bg: 'ws.jadeInk' });

const divider = css({ height: '1px', bg: 'ws.hairline' });
const cancelRow = css({ display: 'flex', alignItems: 'center', width: '100%', minHeight: '50px', padding: '11px 15px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '14px', color: 'ws.sakuraDark', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' } });

const actionPad = css({ padding: '13px 15px 16px', display: 'flex', flexDirection: 'column', gap: '9px' });
const note = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.4' });
const contactLink = css({ color: 'ws.sakuraDark', fontWeight: 'bold', textDecoration: 'underline' });
const inlineError = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.sakuraDark', lineHeight: '1.4' });
const primaryLink = css({ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', padding: '13px', borderRadius: '13px', boxShadow: '0 8px 18px rgba(190,73,112,0.30)' });
// jadeInk fill + onJadeInk (white) text clears WCAG AA; the former jade/clueSurface pairing was ~4.17:1.
const primaryButton = css({ display: 'block', width: '100%', textAlign: 'center', border: 'none', cursor: 'pointer', bg: 'ws.jadeInk', color: 'ws.onJadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', padding: '13px', borderRadius: '13px', boxShadow: '0 8px 18px rgba(33,75,64,0.22)', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' }, _disabled: { opacity: 0.6, cursor: 'default' } });
const loadingRow = css({ padding: '16px 15px', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85 });

// cancel confirmation dialog buttons -------------------------------------
const dConfirm = css({ width: '100%', border: '1.6px solid token(colors.ws.sakuraDark)', bg: 'transparent', color: 'ws.sakuraDark', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14.5px', padding: '12px', borderRadius: '13px', cursor: 'pointer', _hover: { bg: 'ws.sakuraBlush' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' }, _disabled: { opacity: 0.6, cursor: 'default' } });
const dKeep = css({ width: '100%', border: 'none', bg: 'transparent', color: 'ws.khaki', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '6px', cursor: 'pointer', _hover: { color: 'ws.jadeInk' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

function etatFor(subscription: SubscriptionView | null): Etat {
  if (!subscription) return 'free';
  switch (subscription.status) {
    case 'active':
      return 'actif';
    // Failed renewal; identity keeps the user on SUBSCRIBER so access continues while retries run.
    case 'past_due':
      return 'past_due';
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

const TIER_LABEL: Record<Etat, MessageKey> = { actif: 'v2.abonnement.tier.complet', pending: 'v2.abonnement.tier.complet', past_due: 'v2.abonnement.tier.complet', expire: 'v2.abonnement.tier.gratuite', free: 'v2.abonnement.tier.gratuite' };

function periodDateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function periodLabelFor(etat: Etat, periodEnd: string | null): string | null {
  if (periodEnd === null) return null;
  const date = periodDateFr(periodEnd);
  if (etat === 'actif') return t('v2.abonnement.period.renewal', { date });
  if (etat === 'pending') return t('v2.abonnement.period.activeUntil', { date });
  if (etat === 'expire') return t('v2.abonnement.period.ended', { date });
  return null;
}

// Only an actually-ended subscription gets a badge; never-subscribed stays a neutral, unbadged "Version gratuite".
function StatusPill({ etat }: { readonly etat: Etat }) {
  if (etat === 'actif') return <span className={cx(pill, pillActif)}>{t('v2.abonnement.status.actif')}</span>;
  if (etat === 'past_due') return <span className={cx(pill, pillWarn)}>{t('v2.abonnement.status.pastDue')}</span>;
  if (etat === 'pending') return <span className={cx(pill, pillPending)}>{t('v2.abonnement.status.pending')}</span>;
  if (etat === 'expire') return <span className={cx(pill, pillMuted)}>{t('v2.abonnement.status.expire')}</span>;
  return null;
}

function cancelErrorMessage(error: unknown): string {
  if (error instanceof BillingError && error.kind === 'no-active-subscription') {
    return t('v2.abonnement.cancel.error.noActive');
  }
  return t('v2.abonnement.cancel.error.generic');
}

function reactivateErrorMessage(error: unknown): string {
  if (error instanceof BillingError && error.kind === 'no-active-subscription') {
    return t('v2.abonnement.reactivate.error.noActive');
  }
  if (error instanceof BillingError && error.kind === 'provider-unavailable') {
    return t('v2.abonnement.reactivate.error.providerUnavailable');
  }
  return t('v2.abonnement.reactivate.error.generic');
}

function AbonnementPanel({ client }: { readonly client: BillingClient }) {
  const { subscription, loading, error, refetch } = useSubscription(client);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

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

  async function reactivate() {
    setReactivating(true);
    setReactivateError(null);
    try {
      await client.reactivateSubscription();
      refetch();
    } catch (cause) {
      setReactivateError(reactivateErrorMessage(cause));
    } finally {
      setReactivating(false);
    }
  }

  // No subscription is a 404 (no-active-subscription), not a failure: that's the free état.
  const noSubscription = error instanceof BillingError && error.kind === 'no-active-subscription';
  const loadFailed = error !== null && !noSubscription;
  const etat = noSubscription ? 'free' : etatFor(subscription);
  const periodLabel = periodLabelFor(etat, subscription?.periodEnd ?? null);

  return (
    <nav aria-label={t('v2.abonnement.section.title')}>
      <div className={groupLabel}>{t('v2.abonnement.section.title')}</div>
      <div className={cardWrap}>
        {loading ? (
          <div className={loadingRow} role="status" aria-busy="true">
            {t('v2.abonnement.loading')}
          </div>
        ) : loadFailed ? (
          <div className={actionPad}>
            <p className={inlineError} role="status">
              {t('v2.abonnement.loadError')}
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
                  <span className={tierName}>{t(TIER_LABEL[etat])}</span>
                  <StatusPill etat={etat} />
                </span>
                {periodLabel !== null ? <span className={periodLine}>{periodLabel}</span> : null}
              </span>
            </div>

            {etat === 'past_due' ? (
              <div className={actionPad}>
                <p className={note}>
                  {t('v2.abonnement.pastDue.note')}{' '}
                  <a className={contactLink} href="mailto:contact@wordsparrow.io">
                    contact@wordsparrow.io
                  </a>
                  .
                </p>
              </div>
            ) : null}

            {etat === 'actif' || etat === 'past_due' ? (
              <>
                <div className={divider} />
                <button type="button" className={cancelRow} onClick={() => setConfirming(true)}>
                  {t('v2.abonnement.cancel.trigger')}
                </button>
              </>
            ) : null}

            {etat === 'pending' ? (
              <div className={actionPad}>
                <p className={note}>{t('v2.abonnement.pending.note')}</p>
                {reactivateError !== null ? (
                  <p className={inlineError} role="alert">
                    {reactivateError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={primaryButton}
                  disabled={reactivating}
                  onClick={() => void reactivate()}
                >
                  {reactivating ? t('v2.abonnement.reactivate.pending') : t('v2.abonnement.reactivate.cta')}
                </button>
              </div>
            ) : null}

            {etat === 'expire' ? (
              <div className={actionPad}>
                <p className={note}>{t('v2.abonnement.expire.note')}</p>
                <Link to="/abonnement" className={primaryLink}>
                  {t('v2.abonnement.expire.cta')}
                </Link>
              </div>
            ) : null}

            {etat === 'free' ? (
              <div className={actionPad}>
                <p className={note}>{t('v2.abonnement.free.note')}</p>
                <Link to="/abonnement" className={primaryLink}>
                  {t('v2.abonnement.free.cta')}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>

      {confirming ? (
        <Dialog open onClose={() => setConfirming(false)} title={t('v2.abonnement.cancelDialog.title')}>
          <DialogDescription>{t('v2.abonnement.cancelDialog.body')}</DialogDescription>
          {cancelError !== null ? (
            <p className={inlineError} role="alert">
              {cancelError}
            </p>
          ) : null}
          <button type="button" className={dConfirm} disabled={canceling} onClick={() => void confirmCancel()}>
            {canceling ? t('v2.abonnement.cancelDialog.confirming') : t('v2.abonnement.cancelDialog.confirm')}
          </button>
          <button type="button" className={dKeep} onClick={() => setConfirming(false)}>
            {t('v2.abonnement.cancelDialog.keep')}
          </button>
        </Dialog>
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
