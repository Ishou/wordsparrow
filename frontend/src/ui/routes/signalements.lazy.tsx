// `/signalements` lazy half — maintainer triage queue, admin:signalements-gated (ADR-0079 + ADR-0103 + ADR-0108).

import { useState } from 'react';
import { createLazyRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { SignalementQueue } from '@/ui/components/signalements/SignalementQueue';
import { SignalementHistory } from '@/ui/components/signalements/SignalementHistory';
import { AppShell } from '@/ui/v2/AppShell';
import { BackHeader } from '@/ui/v2/BackHeader';
import { GateLoadingScreen } from '@/ui/v2/GateLoadingScreen';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { SegmentedControl } from '@/ui/v2/SegmentedControl';
import { useCapabilityGate } from '@/ui/v2/useCapabilityGate';
import { t } from '@/ui/i18n';
import { Route as ParentRoute } from './signalements';

const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', lineHeight: '1.1', color: 'ws.jadeInk', margin: '0 0 16px' });
const alert = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: 0 });
const tabBar = css({ margin: '0 0 16px' });

type SignalementsOnglet = 'a-traiter' | 'historique';

const ONGLETS: ReadonlyArray<{ readonly id: SignalementsOnglet; readonly label: string }> = [
  { id: 'a-traiter', label: t('route.signalements.onglet.aTraiter') },
  { id: 'historique', label: t('route.signalements.onglet.historique') },
];

function SignalementsPage() {
  const ctx = ParentRoute.useRouteContext();
  const surveyClient = ctx.surveyClient;
  const [onglet, setOnglet] = useState<SignalementsOnglet>('a-traiter');
  return (
    <AppShell variant="flow" topBar={<BackHeader to="/" />} backTo="/">
      <h1 className={title}>{t('route.signalements.heading')}</h1>
      {surveyClient ? (
        <>
          <SegmentedControl
            className={tabBar}
            ariaLabel={t('route.signalements.tabsAria')}
            options={ONGLETS}
            value={onglet}
            onChange={setOnglet}
          />
          {onglet === 'a-traiter' ? (
            <SignalementQueue surveyClient={surveyClient} correctionClient={ctx.correctionClient} />
          ) : (
            <SignalementHistory surveyClient={surveyClient} />
          )}
        </>
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
