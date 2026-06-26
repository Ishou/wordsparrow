import { css } from 'styled-system/css';
import type { SessionClient } from '@/application/session/SessionClient';
import { PrivacyNotice } from '@/ui/components/PrivacyNotice';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

// v2 re-skin of the shared PrivacyNotice body (it owns its own <h1> + sections).
const wrap = css({
  color: 'ws.khaki',
  '& h1, & h2, & h3': { fontFamily: 'wsDisplay', color: 'ws.jadeInk' },
  '& p, & li, & td, & th': { fontFamily: 'wsUi' },
  '& a': { color: 'ws.sakura' },
});

export function ConfidentialiteScreen({
  sessionClient,
}: {
  readonly sessionClient: SessionClient;
}) {
  return (
    <PhoneShell header={<BackHeader />}>
      <div className={wrap}>
        <PrivacyNotice lang="fr" sessionClient={sessionClient} />
      </div>
    </PhoneShell>
  );
}
