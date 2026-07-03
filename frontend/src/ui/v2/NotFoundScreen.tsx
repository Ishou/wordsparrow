import { useLayoutEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PhoneShell } from './PhoneShell';
import { SparrowState } from './SparrowState';
import { sparrowFlightScene } from './SparrowScenes';

// Single source for both not-found surfaces (app-layout + root) so copy and title can't drift.
export const NOT_FOUND_COPY = {
  title: "Cette page s'est envolée",
  body: "On n'a rien trouvé ici. Reviens à l'accueil pour jouer.",
  cta: "Retour à l'accueil",
} as const;

// No per-route head() slot on not-found paths, so set the title imperatively — axe's document-title rule (WCAG 2.4.2) otherwise fails on the stale title.
export function useNotFoundDocumentTitle() {
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = 'Page introuvable — WordSparrow';
    return () => {
      document.title = previous;
    };
  }, []);
}

export function NotFoundScreen() {
  const navigate = useNavigate();
  useNotFoundDocumentTitle();
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene('404')}
        title={NOT_FOUND_COPY.title}
        body={NOT_FOUND_COPY.body}
        cta={{ label: NOT_FOUND_COPY.cta, onClick: () => void navigate({ to: '/' }) }}
      />
    </PhoneShell>
  );
}
