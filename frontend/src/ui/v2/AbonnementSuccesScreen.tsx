import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { CircleNotch } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { SparrowMark } from '@/design-system';
import { t } from '@/ui/i18n';
import { useAuth } from '@/ui/components/auth';
import { useSubscriber } from '@/ui/components/billing';
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

// Mollie confirms via webhook (ADR-0078); poll whoami until grilles:all lands (fast, then slow background re-check) so the CTA never leads to a stale paywall.
const POLL_INTERVAL_MS = 2000;
const SLOW_POLL_INTERVAL_MS = 30_000;
const TIMEOUT_AFTER_ATTEMPTS = 5;

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
      <span className={merciKicker}>{t('v2.abonnement.succes.kicker')}</span>
      <h1 className={merciTitle}>{t('v2.abonnement.succes.title')}</h1>
      <p className={merciText}>{t('v2.abonnement.succes.body')}</p>
      {hasEmail ? <p className={merciText}>{t('v2.abonnement.succes.receipt')}</p> : null}
      <Link to="/grilles" className={merciCta}>
        {t('v2.abonnement.succes.cta')}
      </Link>
    </div>
  );
}

export function CheckoutSuccessScreen() {
  const { authClient } = useRouteContext({ from: '__root__' });
  const { refresh } = useAuth();
  const subscriber = useSubscriber();
  const [attempts, setAttempts] = useState(0);
  const [hasEmail, setHasEmail] = useState(false);

  useEffect(() => {
    if (!authClient) return;
    let cancelled = false;
    authClient.getMe().then((me) => {
      if (!cancelled) setHasEmail(Boolean(me.email));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authClient]);

  // Poll whoami until the capability lands; `subscriber` flipping gates the CTA. Fast burst, then a slow background re-check so a slow webhook self-heals in place.
  useEffect(() => {
    if (subscriber) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        n += 1;
        // A transient whoami() error mid-poll must not flip the whole app to signed-out.
        void refresh({ preserveStateOnFailure: true });
        setAttempts(n);
        schedule(n >= TIMEOUT_AFTER_ATTEMPTS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
      }, delay);
    };
    schedule(POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [subscriber, refresh]);

  const phase: ConfirmPhase = subscriber
    ? 'active'
    : attempts >= TIMEOUT_AFTER_ATTEMPTS
      ? 'timeout'
      : 'confirming';

  if (phase === 'active') {
    return (
      <SuccesShell>
        <MerciConfirmation hasEmail={hasEmail} />
      </SuccesShell>
    );
  }

  return (
    <SuccesShell>
      <h1 className={title}>{t('v2.abonnement.succes.heading')}</h1>
      {phase === 'timeout' ? (
        <p className={statusCard} role="status">
          {t('v2.abonnement.succes.timeout')}
        </p>
      ) : (
        <p className={statusCard} role="status">
          <CircleNotch size={20} weight="bold" aria-hidden="true" className={spin} />
          {t('v2.abonnement.succes.confirming')}
        </p>
      )}
      {phase === 'timeout' ? (
        <Link to="/compte" className={linkStyle}>
          {t('v2.abonnement.succes.backCompte')}
        </Link>
      ) : (
        <Link to="/abonnement" className={linkStyle}>
          {t('v2.abonnement.annule.back')}
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
        <h1 className={title}>{t('v2.abonnement.succes.heading')}</h1>
        <p className={statusCard} role="status">
          {t('v2.abonnement.unavailable')}
        </p>
      </SuccesShell>
    );
  }
  return <CheckoutSuccessScreen />;
}
