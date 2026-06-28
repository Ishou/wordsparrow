import { HeadContent, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';
import { css } from 'styled-system/css';
import type { PuzzleRepository, PuzzleSolver, WordsRepository } from '@/application';
import type { AnalyticsPort } from '@/application/analytics';
import type { AuthClient } from '@/application/auth';
import type { GameClient, LobbyClient } from '@/application/game';
import type { LobbyJoinCodeStash } from '@/application/session/LobbyJoinCodeStash';
import type { SessionClient } from '@/application/session/SessionClient';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { SurveyAnonStore, SurveyClient } from '@/application/survey';
import type { TourSeenStore } from '@/application/tour/TourSeenStore';
import type { Pseudonym, SessionId } from '@/domain/game';
import { SparrowState } from '@/ui/v2/SparrowState';
import { sparrowFlightScene } from '@/ui/v2/SparrowScenes';
import { AnnouncerProvider } from '@/ui/components/a11y/Announcer';
import { Toast, ToastProvider } from '@/ui/components/primitives';

// Router context surface — every route loader receives this object as
// `ctx.context`. The composition root (`main.tsx`) is the only place
// that wires concrete adapters, keeping `ui/` free of `infrastructure/`
// imports (ADR-0002 §7).
//
// Multiplayer adapters (`lobbyClient`, `gameClient`, `getSession`,
// `setPseudonym`) are optional: they are only present when the runtime
// feature flag (ADR-0018 §10) enables the lobby route. Routes that
// consume them are only registered when the flag is on, so they may
// safely assert non-null at the call site.
//
// `setPseudonym` is the write-side counterpart to `getSession`'s
// pseudonym field — exposed here so `ui/routes/` can persist a rename
// without importing `infrastructure/session/` directly (boundary rule
// per ADR-0002 §7). The composition root in `main.tsx` wires it to
// `localStorageSession.setPseudonym`.
export interface AppSession {
  readonly sessionId: SessionId;
  readonly pseudonym: Pseudonym;
}

export interface AppRouterContext {
  readonly puzzleRepository: PuzzleRepository;
  readonly puzzleSolver: PuzzleSolver;
  // Optional: route-level Vitest fixtures can omit it; teaser falls back to inline pairs (ADR-0073).
  readonly wordsRepository?: WordsRepository;
  readonly sessionClient: SessionClient;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly tourSeenStore: TourSeenStore;
  // Phase 5 — identity-api adapter + a thin getter over the anon
  // localStorage pseudonym. Wired in `main.tsx`; `ui/` consumers read
  // both via this context so `infrastructure/` stays out of `ui/`.
  // Optional so route-level Vitest fixtures don't have to stub them
  // (the auth surface is composed at the root via <AuthProvider>;
  // tests that don't wrap in <AuthProvider> simply omit the header
  // auth slot — see `AppHeader.tsx`).
  readonly authClient?: AuthClient;
  readonly getPseudonym?: () => string;
  readonly lobbyClient?: LobbyClient;
  readonly gameClient?: GameClient;
  readonly getSession?: () => AppSession;
  readonly setPseudonym?: (pseudonym: Pseudonym) => void;
  // Survey-api adapter (ADR-0056). Optional; ContribuerPage degrades gracefully when undefined.
  readonly surveyClient?: SurveyClient;
  // Anon-rated dedup store (ADR-0056). Optional for Vitest fixtures.
  readonly surveyAnonStore?: SurveyAnonStore;
  // Analytics port (ADR-0025). Optional; defaults to a no-op in tests.
  readonly analytics?: AnalyticsPort;
  // ADR-0027: per-tab one-shot stash that the `/join/$code` route and
  // the Accueil "Rejoindre" submit populate, and the lobby route's
  // WS-open consumes. Optional alongside the multiplayer adapters
  // because every route that reads it is gated by the same flag.
  readonly lobbyJoinCodeStash?: LobbyJoinCodeStash;
}

// v2 jade surround; self-contained (no router/auth hooks) so it renders even when the failure
// is in the route tree. Reuses the sparrow scene + SparrowState for design consistency.
const errorPageStyles = css({
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  padding: '24px',
});

function RootErrorBoundary() {
  return (
    <main id="main-content" tabIndex={-1} className={errorPageStyles} lang="fr">
      <SparrowState
        scene={sparrowFlightScene()}
        title="Une erreur est survenue"
        body="Recharge la page pour réessayer."
        cta={{ label: 'Recharger la page', onClick: () => window.location.reload() }}
      />
    </main>
  );
}

function RootNotFound() {
  // The 27812a6 refactor dropped hardcoded `<title>` defaults; the
  // not-found path has no per-route `head: () => …` slot, so the
  // document is left without a title — fails axe's `document-title`
  // rule (serious) on the WCAG 2.4.2 baseline. Set it imperatively
  // here so the gate stays green.
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = 'Page introuvable — WordSparrow';
    return () => { document.title = previous; };
  }, []);
  return (
    <main id="main-content" tabIndex={-1} className={errorPageStyles} lang="fr">
      <SparrowState
        scene={sparrowFlightScene('404')}
        title="Page introuvable"
        body="Cette page n'existe pas ou a été déplacée."
        cta={{ label: "Retour à l'accueil", onClick: () => { window.location.href = '/'; } }}
      />
    </main>
  );
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: () => (
    <>
      <HeadContent />
      <AnnouncerProvider>
        <ToastProvider>
          <Outlet />
          <Toast />
        </ToastProvider>
      </AnnouncerProvider>
    </>
  ),
  errorComponent: RootErrorBoundary,
  notFoundComponent: RootNotFound,
});
