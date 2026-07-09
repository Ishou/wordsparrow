import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import type { LoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { AppShell } from './AppShell';
import { BackHeader } from './BackHeader';
import { SparrowState } from './SparrowState';
import { sparrowFlightScene } from './SparrowScenes';
import { PrimaryButton } from './Buttons';

// Transient-loader-failure boundary body: silent instant retry, then capped backoff, then rests at « Réessayer » — never claims the resource doesn't exist (that's the not-found branch's job).

const placeholder = css({
  fontFamily: 'wsUi',
  fontSize: '17px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  textAlign: 'center',
  marginTop: '40px',
});

const retryWrap = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '22px',
});

const retryCta = css({ padding: '0 26px' });

export interface LoaderRetryProps {
  readonly policy: LoaderRetryPolicy;
  // Shown during the silent instant retry. NOT a live region: the boundary remounts per attempt and must never re-announce.
  readonly silentText: string;
}

type Phase = 'silent' | 'retrying' | 'exhausted';

export function LoaderRetry({ policy, silentText }: LoaderRetryProps) {
  const router = useRouter();
  const { say: announce } = useAnnouncer();
  const [phase, setPhase] = useState<Phase>('silent');

  useEffect(() => {
    const decision = policy.next();
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    // Announce from a scheduler task — Announcer.say flushSyncs, which React forbids inside lifecycle methods.
    if (decision == null) {
      setPhase('exhausted');
      timers.push(
        setTimeout(() => announce(t('v2.loader.announce.exhausted')), 0),
      );
    } else {
      setPhase(decision.silent ? 'silent' : 'retrying');
      if (decision.attempt === 2) timers.push(setTimeout(() => announce(t('v2.loader.announce.retrying')), 0));
      timers.push(
        setTimeout(() => {
          void router.invalidate();
        }, decision.delayMs),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [policy, router, announce]);

  const retryNow = () => {
    policy.reset();
    void router.invalidate();
  };

  if (phase === 'exhausted') {
    return (
      <AppShell variant="flow" topBar={<BackHeader to="/" />}>
        <SparrowState
          scene={sparrowFlightScene()}
          title={t('v2.loader.error.title')}
          body={t('v2.loader.error.body')}
          cta={{ label: t('common.retry'), onClick: retryNow }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell variant="flow" topBar={<BackHeader to="/" />}>
      <div className={retryWrap}>
        <p className={placeholder}>{phase === 'silent' ? silentText : t('v2.loader.reconnecting')}</p>
        {phase === 'retrying' ? (
          <PrimaryButton className={retryCta} fullWidth={false} onClick={retryNow}>
            {t('common.retry')}
          </PrimaryButton>
        ) : null}
      </div>
    </AppShell>
  );
}
