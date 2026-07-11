// `/signalements` lazy half — maintainer triage queue, contribuer-gated (ADR-0079 + ADR-0103).

import { createLazyRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { ContentPage } from '@/ui/components/layout';
import { SignalementQueue } from '@/ui/components/signalements/SignalementQueue';
import { NotFoundScreen } from '@/ui/v2/NotFoundScreen';
import { useCapabilityGate } from '@/ui/v2/useCapabilityGate';
import { t } from '@/ui/i18n';
import { Route as ParentRoute } from './signalements';

const statusStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });

function SignalementsPage() {
  const ctx = ParentRoute.useRouteContext();
  const surveyClient = ctx.surveyClient;
  if (!surveyClient) {
    return (
      <ContentPage>
        <p className={statusStyles} role="alert">{t('route.signalements.error')}</p>
      </ContentPage>
    );
  }
  return (
    <ContentPage>
      <SignalementQueue surveyClient={surveyClient} />
    </ContentPage>
  );
}

// Render-only gate; the survey server enforces contribuer. `denied` renders the standard 404 so the route's existence never leaks.
export function SignalementsScreen() {
  const gate = useCapabilityGate('contribuer');
  if (gate === 'loading') {
    return (
      <ContentPage>
        <p className={statusStyles} role="status">{t('common.loading')}</p>
      </ContentPage>
    );
  }
  if (gate === 'denied') return <NotFoundScreen />;
  return <SignalementsPage />;
}

export const Route = createLazyRoute('/signalements')({
  component: SignalementsScreen,
});
