import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import type { LoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';
import { useAnnouncer } from '@/ui/components/a11y/Announcer';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { SparrowState } from './SparrowState';
import { sparrowFlightScene } from './SparrowScenes';
import { PrimaryButton } from './Buttons';

// Transient-loader-failure boundary body: silent instant retry first, then
// auto-retries on the policy's capped backoff, then rests at « Réessayer ».
// Never claims the resource doesn't exist — that's the not-found branch's job.

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
  // Shown during the silent instant retry — same copy as the route's
  // pending state so a one-shot failure is visually seamless. NOT a live
  // region: the boundary remounts per attempt and must never re-announce.
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
        setTimeout(() => announce('Connexion au serveur impossible. Utilise le bouton Réessayer.'), 0),
      );
    } else {
      setPhase(decision.silent ? 'silent' : 'retrying');
      if (decision.attempt === 2) timers.push(setTimeout(() => announce('Reconnexion en cours'), 0));
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
      <PhoneShell header={<BackHeader to="/" />}>
        <SparrowState
          scene={sparrowFlightScene()}
          title="Connexion impossible"
          body="Le serveur ne répond pas. Vérifie ta connexion, puis réessaie."
          cta={{ label: 'Réessayer', onClick: retryNow }}
        />
      </PhoneShell>
    );
  }

  return (
    <PhoneShell header={<BackHeader to="/" />}>
      <div className={retryWrap}>
        <p className={placeholder}>{phase === 'silent' ? silentText : 'Reconnexion…'}</p>
        {phase === 'retrying' ? (
          <PrimaryButton className={retryCta} fullWidth={false} onClick={retryNow}>
            Réessayer
          </PrimaryButton>
        ) : null}
      </div>
    </PhoneShell>
  );
}
