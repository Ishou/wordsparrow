import { css } from 'styled-system/css';
import type { SessionClient } from '@/application/session/SessionClient';
import { PrivacyNotice } from '@/ui/components/PrivacyNotice';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { eyebrow } from './contentPage';

const stack = css({ display: 'flex', flexDirection: 'column', gap: '14px' });

const intro = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: 0,
});

// PrivacyNotice owns its heading structure — parent selectors required.
const card = css({
  bg: 'white',
  borderRadius: '18px',
  padding: '20px 18px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
  color: '#42594F',
  '& h1': {
    fontFamily: 'wsDisplay',
    fontWeight: 'semibold',
    fontSize: '22px',
    color: 'ws.jadeInk',
    lineHeight: '1.15',
  },
  '& h2': {
    fontFamily: 'wsDisplay',
    fontWeight: 'semibold',
    fontSize: '16px',
    color: 'ws.jadeInk',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    _before: {
      content: '""',
      flex: 'none',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      bg: 'ws.sakura',
    },
  },
  '& h3': { fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '14px', color: 'ws.jadeInk' },
  '& p, & li, & td, & th': { fontFamily: 'wsUi', fontSize: '14px', lineHeight: '1.6' },
  '& strong': { fontWeight: 'bold', color: 'ws.jadeInk' },
  '& a': { color: 'ws.sakura', fontWeight: 'bold', textDecoration: 'underline' },
});

export function ConfidentialiteScreen({
  sessionClient,
}: {
  readonly sessionClient: SessionClient;
}) {
  return (
    <PhoneShell header={<BackHeader />}>
      <div className={stack}>
        <header>
          <div className={eyebrow}>Tes données</div>
          <p className={intro}>On garde les choses simples.</p>
        </header>
        <div className={card}>
          <PrivacyNotice lang="fr" sessionClient={sessionClient} />
        </div>
      </div>
    </PhoneShell>
  );
}
