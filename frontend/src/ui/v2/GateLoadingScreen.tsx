import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

const statusCard = css({ bg: 'white', borderRadius: '18px', padding: '16px', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'semibold', color: 'ws.jadeInk', margin: '0 0 18px' });

// No page <h1>: a `denied` resolve flips this to the 404, so showing the page title here would flash the page identity to a non-eligible visitor.
export function GateLoadingScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <p className={statusCard} role="status">
        Chargement…
      </p>
    </PhoneShell>
  );
}
