import { useCallback, useRef, useState } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { css, cx } from 'styled-system/css';
import { Check, ShieldCheck } from '@phosphor-icons/react';
import type { BillingClient } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { useSubscriber } from '@/ui/components/billing';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

type Cadence = 'mensuel' | 'annuel';

interface CadenceOption {
  readonly id: Cadence;
  readonly label: string;
  readonly note: string;
  readonly price: string;
  readonly cadence: string;
}

// Round prices only, TTC (ADR-0080); 20 €/an = two months off the monthly rate.
const CADENCES: ReadonlyArray<CadenceOption> = [
  { id: 'mensuel', label: 'Mensuel', note: 'Tu arrêtes quand tu veux', price: '2 €', cadence: '/mois' },
  { id: 'annuel', label: 'Annuel', note: 'Deux mois offerts', price: '20 €', cadence: '/an' },
];

const ACCES_COMPLET_FEATURES: ReadonlyArray<string> = [
  'Toutes les grilles, sans limite',
  "Tout l'historique, jusqu'à la première",
  'Génère de nouvelles grilles quand tu veux',
  'Et les nouveautés à venir',
];

const GRATUIT_FEATURES: ReadonlyArray<string> = [
  'La grille du jour',
  'Les 7 derniers jours',
  'Tes grilles déjà commencées',
];

const ERROR_MESSAGE_BY_KIND: Readonly<Record<string, string>> = {
  'already-subscribed': 'Tu as déjà un abonnement actif.',
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

const content = css({ display: 'flex', flexDirection: 'column', gap: '15px' });
const hero = css({ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'center' });
const heroTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '25px', lineHeight: '1.12', color: 'ws.jadeInk', margin: '2px 0 0' });
const heroSub = css({ fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.35', margin: 0 });

// Factual framing (ADR-0080): the game is free; the subscription unlocks Accès complet. No donation/pressure copy.
const ethos = css({ bg: 'ws.jade', borderRadius: '13px', padding: '11px 13px', fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.jadeInk', lineHeight: '1.4' });

const planCard = css({ bg: 'white', borderRadius: '18px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', display: 'flex', flexDirection: 'column', gap: '11px' });
const planComplet = css({ border: '1.6px solid token(colors.ws.jade)' });
const planHead = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
const planName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const tagBonus = css({ fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'ws.clueSurface', bg: 'ws.jade', borderRadius: '999px', padding: '3px 9px' });
const tagFree = css({ fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'ws.khaki', bg: 'rgba(33,75,64,0.07)', borderRadius: '999px', padding: '3px 9px' });
const featList = css({ display: 'flex', flexDirection: 'column', gap: '8px' });
const featRow = css({ display: 'flex', alignItems: 'flex-start', gap: '9px', fontFamily: 'wsUi', fontSize: '13.5px', fontWeight: 'bold', color: 'ws.jadeInk', lineHeight: '1.3' });
const tick = css({ flex: 'none', width: '20px', height: '20px', borderRadius: '50%', bg: 'ws.jade', color: 'ws.jadeInk', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' });

const selector = css({ display: 'flex', flexDirection: 'column', gap: '8px' });
const optRow = css({ display: 'flex', alignItems: 'center', gap: '11px', textAlign: 'left', width: '100%', bg: 'white', border: '1.6px solid #E6E0CC', borderRadius: '14px', padding: '12px 13px', cursor: 'pointer', fontFamily: 'wsUi', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
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
// ws.sakuraDark (not ws.sakura) clears WCAG AA for coloured text — known palette gotcha.
const transparenceLink = css({ display: 'block', textAlign: 'center', fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'bold', color: 'ws.sakuraDark', textDecoration: 'underline', _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px', borderRadius: '4px' } });
const errText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: '2px 0 0', textAlign: 'center' });

const subscribedCard = css({ bg: 'white', borderRadius: '18px', padding: '18px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center' });
const subscribedTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', margin: 0 });
const subscribedBody = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.khaki', lineHeight: '1.4', margin: 0 });
const manageLink = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '48px', borderRadius: '14px', bg: 'ws.jadeInk', color: 'white', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '15px', textDecoration: 'none', _hover: { opacity: 0.92 }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

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
    <div className={selector} role="radiogroup" aria-label="Formule">
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
              <span className={optLabel}>{option.label}</span>
              <span className={optNote}>{option.note}</span>
            </span>
            <span className={optPriceWrap}>
              <span className={optPrice}>{option.price}</span>
              <span className={optCadence}>{option.cadence}</span>
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
      <h1 className={subscribedTitle}>Tu es abonné·e</h1>
      <p className={subscribedBody}>Tu as accès à toutes les grilles et à la génération. Gère ton abonnement dans Réglages.</p>
      <Link to="/reglages" className={manageLink}>Aller aux Réglages</Link>
    </div>
  );
}

export function AbonnementOffer({ client }: { readonly client: BillingClient }) {
  const [cadence, setCadence] = useState<Cadence>('mensuel');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onSubscribe = useCallback(async () => {
    setActionError(null);
    setPending(true);
    try {
      // Cadence is presentational for now: the checkout endpoint takes the tier only (ADR-0078 schema).
      const session = await client.createCheckoutSession('subscriber');
      window.location.assign(session.checkoutUrl);
    } catch (cause) {
      setActionError(messageFor(cause));
      setPending(false);
    }
  }, [client]);

  return (
    <div className={content}>
      <div className={hero}>
        <h1 className={heroTitle}>Joue toutes les grilles</h1>
        <p className={heroSub}>Débloque tout l&apos;historique et génère de nouvelles grilles quand tu veux.</p>
      </div>

      <p className={ethos}>Le jeu reste entièrement gratuit. L&apos;abonnement débloque l&apos;Accès complet : toutes les grilles et la génération.</p>

      <section className={cx(planCard, planComplet)} aria-label="Accès complet">
        <div className={planHead}>
          <span className={planName}>Accès complet</span>
          <span className={tagBonus}>En bonus</span>
        </div>
        <div className={featList}>
          {ACCES_COMPLET_FEATURES.map((feature) => (
            <Feature key={feature} label={feature} />
          ))}
        </div>
        <CadenceSelector value={cadence} onChange={setCadence} />
        {/* TODO(W3-follow-up): consent link once /conditions-abonnement lands */}
        <button type="button" className={cta} onClick={() => void onSubscribe()} disabled={pending}>
          S&apos;abonner
        </button>
        {actionError ? (
          <p className={errText} role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <section className={planCard} aria-label="Gratuit">
        <div className={planHead}>
          <span className={planName}>Gratuit</span>
          <span className={tagFree}>Inclus pour tous</span>
        </div>
        <div className={featList}>
          {GRATUIT_FEATURES.map((feature) => (
            <Feature key={feature} label={feature} />
          ))}
        </div>
      </section>

      <p className={reassure}>
        <ShieldCheck size={14} weight="fill" aria-hidden="true" />
        Paiement sécurisé · sans engagement · résiliable à tout moment
      </p>

      <Link to="/abonnement/transparence" className={transparenceLink}>
        Où va ton argent&nbsp;?
      </Link>
    </div>
  );
}

export function AbonnementScreen() {
  const gate = useBillingGate();
  const { billingClient } = useRouteContext({ from: '__root__' });
  const subscribed = useSubscriber();
  if (gate === 'loading') return <GateLoadingScreen />;
  if (gate === 'denied') return <NotFoundScreen />;
  return (
    <PhoneShell header={<BackHeader to="/menu" />} backTo="/menu">
      {subscribed ? (
        <SubscribedState />
      ) : !billingClient ? (
        <div className={subscribedCard}>
          <p className={subscribedBody} role="status">
            L&apos;abonnement n&apos;est pas disponible pour le moment.
          </p>
        </div>
      ) : (
        <AbonnementOffer client={billingClient} />
      )}
    </PhoneShell>
  );
}
