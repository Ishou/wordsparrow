import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { NotFoundScreen } from './NotFoundScreen';
import { GateLoadingScreen } from './GateLoadingScreen';
import { useBillingGate } from './useBillingGate';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const statusCard = css({ bg: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: '0 0 14px' });
const lede = css({ fontFamily: 'wsUi', fontSize: '14px', lineHeight: '1.5', color: 'ws.khaki', margin: '0 0 18px' });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for coloured text — known palette gotcha.
const linkStyle = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', textDecoration: 'underline' });

export function CheckoutCancelScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <h1 className={title}>Paiement annulé</h1>
      <p className={statusCard} role="status">
        Aucun montant n'a été débité.
      </p>
      <p className={lede}>
        WordSparrow reste gratuit. Si tu changes d'avis, tu peux relancer l'abonnement quand tu
        veux.
      </p>
      <Link to="/abonnement" className={linkStyle}>
        Revenir à mon abonnement
      </Link>
    </PhoneShell>
  );
}

export function AbonnementAnnuleScreen() {
  const gate = useBillingGate();
  if (gate === 'loading') return <GateLoadingScreen />;
  if (gate === 'denied') return <NotFoundScreen />;
  return <CheckoutCancelScreen />;
}
