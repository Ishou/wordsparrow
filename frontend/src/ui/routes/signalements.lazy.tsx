// `/signalements` lazy half — maintainer triage queue, admin:signalements-gated (ADR-0079 + ADR-0103 + ADR-0108).

import { createLazyRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { SignalementQueue } from '@/ui/components/signalements/SignalementQueue';
import { AppShell } from '@/ui/v2/AppShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { GateLoadingScreen } from '@/ui/v2/GateLoadingScreen';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { useCapabilityGate } from '@/ui/v2/useCapabilityGate';
import { t } from '@/ui/i18n';
import { Route as ParentRoute } from './signalements';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const alert = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: 0 });

function SignalementsPage() {
  const ctx = ParentRoute.useRouteContext();
  const surveyClient = ctx.surveyClient;
  return (
    <AppShell variant="flow" topBar={<BackHeader to="/" />} backTo="/">
      <h1 className={title}>{t('route.signalements.heading')}</h1>
      {surveyClient ? (
        <SignalementQueue surveyClient={surveyClient} correctionClient={ctx.correctionClient} />
      ) : (
        <p className={alert} role="alert">{t('route.signalements.error')}</p>
      )}
    </AppShell>
  );
}

// Render-only gate; the grid/survey servers enforce admin:signalements. Nothing signalement-specific renders until `allowed`: `loading` shows a neutral loader and `denied` renders the standard 404, so the route's existence never leaks.
export function SignalementsScreen() {
  const gate = useCapabilityGate('admin:signalements');
  if (gate === 'loading') return <GateLoadingScreen backTo="/" />;
  if (gate === 'denied') return <NotFoundScreen />;
  return <SignalementsPage />;
}

export const Route = createLazyRoute('/signalements')({
  component: SignalementsScreen,
});
