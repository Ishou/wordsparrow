import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import { Check, ShieldCheck } from '@phosphor-icons/react';
import { t, type MessageKey } from '@/ui/i18n';
import type { BillingCadence, BillingClient } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { useSubscriber } from '@/ui/components/billing';
import { useOptionalAuth } from '@/ui/components/auth';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { GateLoadingScreen } from './GateLoadingScreen';
import { CGV_VERSION } from './cgv';

type Cadence = 'mensuel' | 'annuel';

const WIRE_CADENCE: Readonly<Record<Cadence, BillingCadence>> = { mensuel: 'monthly', annuel: 'yearly' };

interface CadenceOption {
  readonly id: Cadence;
  readonly labelKey: MessageKey;
  readonly noteKey: MessageKey;
  readonly price: string;
  readonly suffixKey: MessageKey;
}

// Round prices only, TTC (ADR-0080); 20 €/an = two months off the monthly rate.
const CADENCES: ReadonlyArray<CadenceOption> = [
  { id: 'mensuel', labelKey: 'v2.abonnement.cadence.mensuel.label', noteKey: 'v2.abonnement.cadence.mensuel.note', price: '2 €', suffixKey: 'v2.abonnement.cadence.mensuel.suffix' },
  { id: 'annuel', labelKey: 'v2.abonnement.cadence.annuel.label', noteKey: 'v2.abonnement.cadence.annuel.note', price: '20 €', suffixKey: 'v2.abonnement.cadence.annuel.suffix' },
];

interface Recap {
  readonly price: string;
  readonly periodKey: MessageKey;
  readonly renewalKey: MessageKey;
}
const RECAP_BY_CADENCE: Readonly<Record<Cadence, Recap>> = {
  mensuel: { price: '2 € TTC', periodKey: 'v2.abonnement.recap.mensuel.period', renewalKey: 'v2.abonnement.recap.mensuel.renewal' },
  annuel: { price: '20 € TTC', periodKey: 'v2.abonnement.recap.annuel.period', renewalKey: 'v2.abonnement.recap.annuel.renewal' },
};

const ACCES_COMPLET_FEATURE_KEYS: ReadonlyArray<MessageKey> = [
  'v2.abonnement.feature.complet.all',
  'v2.abonnement.feature.complet.history',
  'v2.abonnement.feature.complet.generate',
  'v2.abonnement.feature.complet.future',
];

const GRATUIT_FEATURE_KEYS: ReadonlyArray<MessageKey> = [
  'v2.abonnement.feature.gratuit.daily',
  'v2.abonnement.feature.gratuit.week',
  'v2.abonnement.feature.gratuit.started',
];

const ERROR_MESSAGE_KEY_BY_KIND: Readonly<Record<string, MessageKey>> = {
  'already-subscribed': 'v2.abonnement.error.alreadySubscribed',
  'auth-required': 'v2.abonnement.error.authRequired',
  'provider-unavailable': 'v2.abonnement.error.providerUnavailable',
  'rate-limited': 'v2.abonnement.error.rateLimited',
};
function messageFor(error: unknown): string {
  if (error instanceof BillingError) {
    const key = ERROR_MESSAGE_KEY_BY_KIND[error.kind];
    return key ? t(key) : t('v2.abonnement.error.generic');
  }
  return t('v2.abonnement.error.generic');
}

const content = css({ display: 'flex', flexDirection: 'column', gap: '15px' });
const hero = css({ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'center' });
const heroTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '25px', lineHeight: '1.12', color: 'ws.jadeInk', margin: '2px 0 0' });
const heroSub = css({ fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.35', margin: 0 });

// Factual framing (ADR-0080): the game is free; the subscription unlocks Accès complet. No donation/pressure copy.
const ethos = css({ bg: 'ws.jade', borderRadius: '13px', padding: '11px 13px', fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.jadeInk', lineHeight: '1.4' });

const planCard = css({ bg: 'ws.card', borderRadius: '18px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', display: 'flex', flexDirection: 'column', gap: '11px' });
const planComplet = css({ border: '1.6px solid token(colors.ws.jade)' });
const planHead = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
const planName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const tagFree = css({ fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'ws.khaki', bg: 'ws.chipFaint', borderRadius: '999px', padding: '3px 9px' });
const featList = css({ display: 'flex', flexDirection: 'column', gap: '8px' });
const featRow = css({ display: 'flex', alignItems: 'center', gap: '9px', fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.jadeInk', lineHeight: '1.3' });
const tick = css({ flex: 'none', width: '20px', height: '20px', borderRadius: '50%', bg: 'ws.jade', color: 'ws.jadeInk', display: 'flex', alignItems: 'center', justifyContent: 'center' });

const selector = css({ display: 'flex', flexDirection: 'column', gap: '8px' });
const optRow = css({ display: 'flex', alignItems: 'center', gap: '11px', textAlign: 'left', width: '100%', bg: 'ws.card', border: '1.6px solid #E6E0CC', borderRadius: '14px', padding: '12px 13px', cursor: 'pointer', fontFamily: 'wsUi', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const optRowOn = css({ borderColor: 'token(colors.ws.sakura)', bg: 'ws.sakuraBlush', boxShadow: '0 4px 14px rgba(190,73,112,0.12)' });
const radio = css({ flex: 'none', width: '20px', height: '20px', borderRadius: '50%', border: '2px solid token(colors.ws.khaki)', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' });
const radioOn = css({ borderColor: 'token(colors.ws.sakuraDark)', opacity: 1, bg: 'ws.sakuraDark', color: 'white' });
const optMid = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' });
const optLabel = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
const optNote = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.3' });
const optPriceWrap = css({ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '2px' });
const optPrice = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '18px', color: 'ws.jadeInk' });
const optCadence = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', color: 'ws.khaki' });

// ws.sakuraDark (not ws.sakura) clears WCAG AA for white text — known palette gotcha.
const cta = css({ width: '100%', border: 'none', bg: 'ws.sakuraDark', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '16px', padding: '14px', borderRadius: '14px', cursor: 'pointer', boxShadow: '0 8px 18px rgba(190,73,112,0.34)', _hover: { opacity: 0.94 }, _disabled: { opacity: 0.5, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const reassure = css({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'wsUi', fontSize: '11.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, textAlign: 'center', lineHeight: '1.4' });
const reassureIcon = css({ flex: 'none', display: 'flex' });

// CGV Art. 7 récapitulatif shown before payment (ADR-0094).
const recap = css({ bg: 'ws.chipFaint', borderRadius: '13px', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '8px' });
const recapTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '15px', color: 'ws.jadeInk', margin: 0 });
const recapRow = css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', fontFamily: 'wsUi', fontSize: '12.5px', lineHeight: '1.35' });
const recapKey = css({ fontWeight: 'semibold', color: 'ws.khaki', flex: 'none' });
const recapVal = css({ fontWeight: 'bold', color: 'ws.jadeInk', textAlign: 'right' });
const recapNote = css({ fontFamily: 'wsUi', fontSize: '11.5px', fontWeight: 'semibold', color: 'ws.khaki', lineHeight: '1.4', margin: 0 });

// CGV Art. 7 + 13 double-consent checkboxes (ADR-0094).
const consentGroup = css({ display: 'flex', flexDirection: 'column', gap: '11px' });
const consentRow = css({ display: 'flex', alignItems: 'flex-start', gap: '10px' });
const checkbox = css({ flex: 'none', width: '20px', height: '20px', marginTop: '1px', accentColor: 'token(colors.ws.sakuraDark)', cursor: 'pointer', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const consentLabel = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'semibold', color: 'ws.jadeInk', lineHeight: '1.4', cursor: 'pointer', '& a': { color: 'ws.sakuraDark', fontWeight: 'bold', textDecoration: 'underline' } });

const confirmHint = css({ fontFamily: 'wsUi', fontSize: '11.5px', fontWeight: 'bold', color: 'ws.khaki', textAlign: 'center', lineHeight: '1.4', margin: 0 });
const secondaryCta = css({ width: '100%', border: '1.6px solid token(colors.ws.khaki)', bg: 'transparent', color: 'ws.jadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', padding: '11px', borderRadius: '14px', cursor: 'pointer', _hover: { bg: 'ws.chipFaint' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: '2px 0 0', textAlign: 'center' });

const subscribedCard = css({ bg: 'ws.card', borderRadius: '18px', padding: '18px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center' });
const subscribedTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', margin: 0 });
const subscribedBody = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.khaki', lineHeight: '1.4', margin: 0 });
const manageLink = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '48px', borderRadius: '14px', bg: 'ws.jadeInk', color: 'ws.onJadeInk', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', textDecoration: 'none', _hover: { opacity: 0.92 }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

function Feature({ label }: { readonly label: string }) {
  return (
    <div className={featRow}>
      <span className={tick}><Check size={13} weight="bold" aria-hidden="true" /></span>
      <span>{label}</span>
    </div>
  );
}

function CadenceSelector({ value, onChange }: { readonly value: Cadence; readonly onChange: (cadence: Cadence) => void }) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = CADENCES.findIndex((option) => option.id === value);

  function focusIndex(next: number): void {
    const clamped = Math.max(0, Math.min(CADENCES.length - 1, next));
    buttonsRef.current[clamped]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = index === 0 ? CADENCES.length - 1 : index - 1;
      onChange(CADENCES[nextIndex].id);
      focusIndex(nextIndex);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = index === CADENCES.length - 1 ? 0 : index + 1;
      onChange(CADENCES[nextIndex].id);
      focusIndex(nextIndex);
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onChange(CADENCES[index].id);
    }
  }

  return (
    <div className={selector} role="radiogroup" aria-label={t('v2.abonnement.selector.aria.group')}>
      {CADENCES.map((option, index) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            ref={(el) => { buttonsRef.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={index === activeIndex ? 0 : -1}
            className={on ? cx(optRow, optRowOn) : optRow}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={on ? cx(radio, radioOn) : radio}>{on ? <Check size={12} weight="bold" aria-hidden="true" /> : null}</span>
            <span className={optMid}>
              <span className={optLabel}>{t(option.labelKey)}</span>
              <span className={optNote}>{t(option.noteKey)}</span>
            </span>
            <span className={optPriceWrap}>
              <span className={optPrice}>{option.price}</span>
              <span className={optCadence}>{t(option.suffixKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SubscribedState() {
  return (
    <div className={subscribedCard}>
      <h1 className={subscribedTitle}>{t('v2.abonnement.subscribed.title')}</h1>
      <p className={subscribedBody}>{t('v2.abonnement.subscribed.body')}</p>
      <Link to="/reglages" className={manageLink}>{t('v2.abonnement.subscribed.manage')}</Link>
    </div>
  );
}

export function AbonnementOffer({ client }: { readonly client: BillingClient }) {
  const [cadence, setCadence] = useState<Cadence>('mensuel');
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [withdrawalWaiver, setWithdrawalWaiver] = useState(false);
  const [step, setStep] = useState<'review' | 'confirm'>('review');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const bothAccepted = cgvAccepted && withdrawalWaiver;
  const info = RECAP_BY_CADENCE[cadence];

  const auth = useOptionalAuth();
  const { authClient } = useRouteContext({ from: '__root__' });
  // Only a confirmed-anon visitor is a guest (loading shows the normal flow, no flicker).
  const isGuest = auth?.state.status === 'anon';

  // Back from the hosted checkout restores this page from the bfcache with pending frozen true (assign never unwinds it); reset so the CTA works again.
  useEffect(() => {
    const reEnableOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener('pageshow', reEnableOnRestore);
    return () => window.removeEventListener('pageshow', reEnableOnRestore);
  }, []);

  // Any change to the choices reopens the double-clic review (art. 1127-2 — re-confirm after a correction).
  const selectCadence = useCallback((next: Cadence) => {
    setCadence(next);
    setStep('review');
  }, []);
  const toggleCgv = useCallback((checked: boolean) => {
    setCgvAccepted(checked);
    setStep('review');
  }, []);
  const toggleWaiver = useCallback((checked: boolean) => {
    setWithdrawalWaiver(checked);
    setStep('review');
  }, []);

  const onPrimary = useCallback(async () => {
    if (isGuest) {
      // Guests must sign in before checkout (session-derived userId, ADR-0078); return to the offer to complete it.
      const signInUrl = authClient?.signInUrl('google', '/abonnement');
      if (signInUrl) window.location.assign(signInUrl);
      return;
    }
    if (!bothAccepted) return;
    if (step === 'review') {
      setStep('confirm');
      return;
    }
    setActionError(null);
    setPending(true);
    try {
      const session = await client.createCheckoutSession('subscriber', WIRE_CADENCE[cadence], {
        cgvAccepted: true,
        cgvVersion: CGV_VERSION,
        withdrawalWaiver: true,
      });
      window.location.assign(session.checkoutUrl);
    } catch (cause) {
      setActionError(messageFor(cause));
      setPending(false);
    }
  }, [isGuest, authClient, bothAccepted, step, client, cadence]);

  return (
    <div className={content}>
      <div className={hero}>
        <h1 className={heroTitle}>{t('v2.abonnement.offer.heroTitle')}</h1>
        <p className={heroSub}>{t('v2.abonnement.offer.heroSub')}</p>
      </div>

      <p className={ethos}>{t('v2.abonnement.offer.ethos')}</p>

      <section className={cx(planCard, planComplet)} aria-label={t('v2.abonnement.tier.complet')}>
        <div className={planHead}>
          <span className={planName}>{t('v2.abonnement.tier.complet')}</span>
        </div>
        <div className={featList}>
          {ACCES_COMPLET_FEATURE_KEYS.map((key) => (
            <Feature key={key} label={t(key)} />
          ))}
        </div>
        <CadenceSelector value={cadence} onChange={selectCadence} />

        <section className={recap} aria-label={t('v2.abonnement.recap.aria')}>
          <h2 className={recapTitle}>{t('v2.abonnement.recap.title')}</h2>
          <div className={recapRow}>
            <span className={recapKey}>{t('v2.abonnement.recap.key.offre')}</span>
            <span className={recapVal}>{t('v2.abonnement.tier.complet')}</span>
          </div>
          <div className={recapRow}>
            <span className={recapKey}>{t('v2.abonnement.recap.key.prix')}</span>
            <span className={recapVal}>{info.price} {t(info.periodKey)}</span>
          </div>
          <div className={recapRow}>
            <span className={recapKey}>{t('v2.abonnement.recap.key.premierPrelevement')}</span>
            <span className={recapVal}>{t('v2.abonnement.recap.val.aujourdhui')}</span>
          </div>
          <div className={recapRow}>
            <span className={recapKey}>{t('v2.abonnement.recap.key.reconduction')}</span>
            <span className={recapVal}>{t(info.renewalKey)}</span>
          </div>
          <p className={recapNote}>
            {t('v2.abonnement.recap.note', { period: t(info.periodKey) })}
          </p>
        </section>

        {isGuest ? null : (
        <div className={consentGroup}>
          <div className={consentRow}>
            <input
              id="consent-cgv"
              type="checkbox"
              className={checkbox}
              checked={cgvAccepted}
              onChange={(event) => toggleCgv(event.target.checked)}
            />
            <label htmlFor="consent-cgv" className={consentLabel}>
              {t('v2.abonnement.consent.cgv.text')}{' '}
              <Link to="/conditions-abonnement" onClick={(event) => event.stopPropagation()}>
                {t('v2.abonnement.consent.cgv.link')}
              </Link>
              .
            </label>
          </div>
          <div className={consentRow}>
            <input
              id="consent-waiver"
              type="checkbox"
              className={checkbox}
              checked={withdrawalWaiver}
              onChange={(event) => toggleWaiver(event.target.checked)}
            />
            <label htmlFor="consent-waiver" className={consentLabel}>
              {t('v2.abonnement.consent.waiver')}
            </label>
          </div>
        </div>
        )}

        <button
          type="button"
          className={cta}
          onClick={() => void onPrimary()}
          disabled={isGuest ? pending : !bothAccepted || pending}
        >
          {isGuest ? t('v2.abonnement.cta.signIn') : step === 'confirm' ? t('v2.abonnement.cta.confirm') : t('v2.abonnement.cta.subscribe')}
        </button>
        {step === 'confirm' ? (
          <>
            <p className={confirmHint} role="status">{t('v2.abonnement.confirmHint')}</p>
            <button type="button" className={secondaryCta} onClick={() => setStep('review')} disabled={pending}>
              {t('v2.abonnement.confirm.modify')}
            </button>
          </>
        ) : null}
        {actionError ? (
          <p className={errText} role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <section className={planCard} aria-label={t('v2.abonnement.tier.gratuit')}>
        <div className={planHead}>
          <span className={planName}>{t('v2.abonnement.tier.gratuit')}</span>
          <span className={tagFree}>{t('v2.abonnement.plan.gratuit.tag')}</span>
        </div>
        <div className={featList}>
          {GRATUIT_FEATURE_KEYS.map((key) => (
            <Feature key={key} label={t(key)} />
          ))}
        </div>
      </section>

      <p className={reassure}>
        <span className={reassureIcon}>
          <ShieldCheck size={14} weight="fill" aria-hidden="true" />
        </span>
        <span>{t('v2.abonnement.reassure')}</span>
      </p>
    </div>
  );
}

export function AbonnementScreen() {
  const auth = useOptionalAuth();
  const { billingClient } = useRouteContext({ from: '__root__' });
  const subscribed = useSubscriber();
  // Visible to everyone; checkout stays auth- + capability-gated server-side (ADR-0078).
  if (auth?.state.status === 'loading') return <GateLoadingScreen />;
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      {subscribed ? (
        <SubscribedState />
      ) : !billingClient ? (
        <div className={subscribedCard}>
          <p className={subscribedBody} role="status">
            {t('v2.abonnement.unavailable')}
          </p>
        </div>
      ) : (
        <AbonnementOffer client={billingClient} />
      )}
    </PhoneShell>
  );
}
