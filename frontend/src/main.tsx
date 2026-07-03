import { applyThemePreference, loadThemePreference, watchSystemTheme } from '@/infrastructure/session/localStorageTheme';
// Composition root for the Bliss frontend bundle. This file is the only
// place where the ui and infrastructure layers are wired together; it is
// excluded from the layered architecture rules in eslint.config.js.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import { createAppRouter } from '@/ui/router';
import {
  createDedupedPuzzleRepository,
  createHttpAuthClient,
  createHttpBillingClient,
  createHttpLobbyClient,
  createHttpPuzzleRepository,
  createHttpPuzzleSolver,
  createHttpSurveyClient,
  createHttpWordsRepository,
  createReconnectingGameClient,
  createWebSocketGameClient,
} from '@/infrastructure';
import { createHttpSessionClient } from '@/infrastructure/api/grid/HttpSessionClient';
import { AuthProvider } from '@/ui/components/auth';
import {
  createMatomoTracker,
  readMatomoConfigFromEnv,
} from '@/infrastructure/analytics/matomoTracker';
import {
  initOtelTracer,
  readOtelConfigFromEnv,
  reportCaughtError,
} from '@/infrastructure/observability/otelTracer';
import {
  clearSession,
  getOrCreateSessionId,
  getPseudonym,
  setPseudonym,
} from '@/infrastructure/session/localStorageSession';
import {
  clearAllSoloEntriesForEverySession,
  clearReconciledUserId,
  clearSoloEntriesForPuzzle,
  listSoloPuzzleIds,
  loadReconciledUserId,
  loadSoloElapsed,
  loadSoloEntries,
  loadSoloHintsUsed,
  loadSoloLockedCells,
  loadSoloPayload,
  recordSoloHintUsed,
  replaceSoloPayload,
  saveReconciledUserId,
  saveSoloElapsed,
  saveSoloLetter,
  saveSoloLockedCell,
} from '@/infrastructure/session/localStorageSolo';
import { createHttpProgressSyncClient } from '@/infrastructure/api/identity/HttpProgressSyncClient';
import {
  clearTourSeen,
  getTourSeen,
  setTourSeen,
} from '@/infrastructure/session/localStorageTour';
import { surveyAnonRatedStore } from '@/infrastructure/session/localStorageSurveyAnon';
import {
  createSoloEntriesStore,
  type SoloEntriesStorage,
  type SoloEntriesStore,
} from '@/application/solo/SoloEntriesStore';
import {
  createProgressSyncService,
  createSyncingSoloEntriesStore,
  type SoloProgressBlobStore,
} from '@/application/progress';
import type { TourSeenStore } from '@/application/tour/TourSeenStore';
import type { SessionClient } from '@/application/session/SessionClient';
import { registerServiceWorker } from '@/infrastructure/pwa';
import { signalUpdateAvailable } from '@/ui/v2/UpdatePrompt';
import { sessionStorageLobbyJoinCodeStash } from '@/infrastructure/session/sessionStorageLobbyJoinCode';
import type { Pseudonym, SessionId } from '@/domain/game';
// v2 (ADR-0072) faces, declared inline with font-display: block — see the file header.
import '@/design-system/fonts.css';
import '@/ui/styles/index.css';
// ADR-0072 §3 — preload above-the-fold v2 faces (Fredoka + Nunito latin) to fill the block window.
import fredokaLatinUrl from '@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2?url';
import nunitoLatinUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
for (const href of [fredokaLatinUrl, nunitoLatinUrl]) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.href = href;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

// MSW bootstrap (ADR-0007 §5). Two independent flags pick which API
// surfaces are intercepted:
//
//   * VITE_MOCK_GRID_API  → mocks `/v1/puzzles/...` (grid backend)
//   * VITE_MOCK_GAME_API  → mocks `/v1/lobbies/...` REST and the
//                           `/v1/lobbies/:id/ws` WebSocket
//
// `.env`             — both false (production hits real backends).
// `.env.preview`     — both true  (Cloudflare Pages previews are
//                                  self-contained, no live backends).
// `.env.development` — both false (real backends on localhost). A
//                      contributor without one of the services
//                      running drops a `.env.development.local`
//                      override that flips the matching flag to
//                      `true` for an MSW fallback.
//
// Production builds set both flags false; the dynamic `import()`
// below becomes dead code under falsy literal env values, so Vite
// tree-shakes `msw/browser` and every handler out. Verified with:
//
//   pnpm build && grep -r setupWorker dist/   # → empty
//
// The promise-chained app bootstrap ensures the service worker is
// active *before* React renders, so the very first XHR from the
// router loader is intercepted (avoids a race where the initial
// fetch slips through to the real API host).
async function enableMocks(): Promise<void> {
  const mockGrid = import.meta.env.VITE_MOCK_GRID_API === 'true';
  const mockGame = import.meta.env.VITE_MOCK_GAME_API === 'true';
  const mockSurvey = import.meta.env.VITE_MOCK_SURVEY_API === 'true';
  if (!mockGrid && !mockGame && !mockSurvey) return;
  const mod = await import('@/infrastructure/mocks/browser');
  const handlersMod = await import('@/infrastructure/mocks/handlers');
  const handlers = [
    ...(mockGrid ? handlersMod.gridApiHandlers : []),
    ...(mockGame ? handlersMod.gameApiHandlers : []),
    ...(mockSurvey ? handlersMod.surveyApiHandlers : []),
  ];
  const worker = mod.createWorker(handlers);
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
  });
  // Expose the worker + the `http`/`HttpResponse` helpers on
  // `globalThis.__msw__` so e2e specs can call `worker.use(...)` to
  // override a single handler per test. This is the only way to swap a
  // response when MSW's service worker is intercepting: Playwright's
  // `page.route` is bypassed by the SW fetch handler. Guarded by the
  // same mock flags above, so production builds (both flags false)
  // tree-shake this branch out alongside the rest of `enableMocks()`.
  // The handle is intentionally namespaced with `__` to flag it as a
  // test seam; nothing in `src/` reads it.
  const mswMod = await import('msw');
  const w = globalThis as unknown as {
    __msw__?: {
      worker: typeof worker;
      http: typeof mswMod.http;
      HttpResponse: typeof mswMod.HttpResponse;
    };
    __mswReady__?: Promise<void>;
  };
  w.__msw__ = { worker, http: mswMod.http, HttpResponse: mswMod.HttpResponse };
  // If an e2e spec (via `page.addInitScript`) seeded a deferred
  // `__mswReady__` promise, await it so per-test `worker.use(...)`
  // handlers are registered before the router's loaders fire their
  // first fetch. Resolves immediately when no test is wiring this up.
  if (w.__mswReady__) {
    await w.__mswReady__;
  }
}

// Initialise OTel before the first fetch so the FetchInstrumentation can
// patch the global. Noop when VITE_OTEL_OTLP_ENDPOINT is unset
// (dev / preview / pre-PR-F.2 prod). ADR-0033.
initOtelTracer(readOtelConfigFromEnv());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in index.html');
}

enableMocks()
  .catch((err: unknown) => {
    // Dev/preview only; tree-shaken away in production builds.
    console.error('[MSW] worker failed to start, continuing without mock:', err);
  })
  .then(() => {
    const gridApiBaseUrl = import.meta.env.VITE_GRID_API_URL;
    const puzzleRepository = createDedupedPuzzleRepository(
      createHttpPuzzleRepository({ baseUrl: gridApiBaseUrl }),
    );
    // ADR-0089: prime the daily fetch pre-mount; loaders join the in-flight promise. Post-MSW-start so previews stay mocked.
    void puzzleRepository.fetchDaily().catch(() => {});
    // Session id is retained for multiplayer presence; grid-api hints authenticate via cookie.
    const sessionId = getOrCreateSessionId();
    const puzzleSolver = createHttpPuzzleSolver({
      baseUrl: gridApiBaseUrl,
    });
    const wordsRepository = createHttpWordsRepository({
      baseUrl: gridApiBaseUrl,
    });
    // Compose the full SessionClient: the HTTP adapter covers eraseSession
    // while the localStorage helpers cover getSessionId/clearLocalSession.
    // This is the only place allowed to import both; ui/ components receive
    // the composed port through router context (ADR-0002 §7).
    //
    // The HTTP adapter fans the erasure call out to BOTH grid-api and
    // game-api so the RGPD "Effacer mes données" surface covers the
    // multiplayer cascade (ADR-0039) in addition to grid hints. When
    // multiplayer is disabled the game-api base URL is left undefined and
    // the adapter degrades to a grid-only call.
    const multiplayerForErase = import.meta.env.VITE_FEATURE_MULTIPLAYER === 'true';
    const sessionClient: SessionClient = {
      ...createHttpSessionClient({
        gridBaseUrl: gridApiBaseUrl,
        gameBaseUrl: multiplayerForErase ? import.meta.env.VITE_GAME_API_BASE_URL : undefined,
      }),
      getSessionId: getOrCreateSessionId,
      clearLocalSession: () => {
        // Sweep all solo-entries keys first; RGPD Art. 17 would orphan per-grid data under the old session id otherwise.
        clearAllSoloEntriesForEverySession();
        clearSession();
        clearTourSeen();
      },
    };

    // Lazy session-id binding makes session rotation (RGPD erase → reseed) transparent to ui/.
    const soloEntriesStorage: SoloEntriesStorage = {
      loadEntries: loadSoloEntries,
      saveLetter: saveSoloLetter,
      loadLocked: loadSoloLockedCells,
      lockCell: saveSoloLockedCell,
      loadHintsUsed: loadSoloHintsUsed,
      recordHintUsed: recordSoloHintUsed,
      loadElapsed: loadSoloElapsed,
      saveElapsed: saveSoloElapsed,
      clearForPuzzle: clearSoloEntriesForPuzzle,
    };
    const localSoloEntriesStore: SoloEntriesStore = createSoloEntriesStore({
      getSessionId: getOrCreateSessionId,
      storage: soloEntriesStorage,
    });

    // Onboarding-tour completion flag. Same indirection rationale as
    // SoloEntriesStore — keep the localStorage seam outside ui/.
    const tourSeenStore: TourSeenStore = {
      get: getTourSeen,
      set: setTourSeen,
      clear: clearTourSeen,
    };

    // Cookieless Matomo tracker (ADR-0025). No-op when env vars are unset
    // (local dev / preview / pre-Matomo prod).
    const tracker = createMatomoTracker(readMatomoConfigFromEnv());
    // ADR-0018 §10 — multiplayer ships dark. The lobby route, its
    // adapters, and the session accessor are only instantiated when
    // the runtime flag is on. Production flips this to `'true'` after
    // the game-api Helm chart is live and the smoke tests pass; the
    // flag expires no later than 2026-08-02 per .env.
    // Identity-api adapter. Defaults to the production host so the
    // bundle works even if the env var is unset; preview / dev override
    // via .env.preview / .env.development.local.
    const identityApiBaseUrl =
      import.meta.env.VITE_IDENTITY_API_BASE_URL ?? 'https://auth.wordsparrow.io';
    const authClient = createHttpAuthClient({ baseUrl: identityApiBaseUrl });

    // Cross-device solo-progress sync side-channel (ADR-0075).
    const soloProgressBlobStore: SoloProgressBlobStore = {
      loadPayload: loadSoloPayload,
      replacePayload: replaceSoloPayload,
      listPuzzleIds: listSoloPuzzleIds,
    };
    const progressSyncService = createProgressSyncService({
      client: createHttpProgressSyncClient({ baseUrl: identityApiBaseUrl }),
      blobStore: soloProgressBlobStore,
      getSessionId: getOrCreateSessionId,
      reconciledStore: {
        load: loadReconciledUserId,
        save: saveReconciledUserId,
        clear: clearReconciledUserId,
      },
    });
    const soloEntriesStore: SoloEntriesStore = createSyncingSoloEntriesStore(
      localSoloEntriesStore,
      (puzzleId) => progressSyncService.schedulePush(puzzleId),
    );

    const multiplayer = import.meta.env.VITE_FEATURE_MULTIPLAYER === 'true';
    // Survey-api adapter (ADR-0056).
    const surveyApiBaseUrl =
      import.meta.env.VITE_SURVEY_API_BASE_URL ?? 'https://survey.wordsparrow.io';
    const surveyClient = createHttpSurveyClient({ baseUrl: surveyApiBaseUrl });
    // Billing-api adapter (ADR-0078). Same default-to-prod-host idiom as identity/survey.
    const billingApiBaseUrl =
      import.meta.env.VITE_BILLING_API_BASE_URL ?? 'https://billing.wordsparrow.io';
    const billingClient = createHttpBillingClient({ baseUrl: billingApiBaseUrl });
    // Analytics port (ADR-0025).
    const analytics = {
      trackEvent: (category: string, action: string, name?: string, value?: number) => {
        tracker.trackEvent(category, action, name, value);
      },
    };
    const baseContext = { authClient, getPseudonym, surveyClient, surveyAnonStore: surveyAnonRatedStore, analytics, progressSyncService, billingClient };
    const context = multiplayer
      ? (() => {
          const gameApiBaseUrl = import.meta.env.VITE_GAME_API_BASE_URL;
          const lobbyClient = createHttpLobbyClient({ baseUrl: gameApiBaseUrl });
          // WebSocket URL derives from the same host: swap http(s) for
          // ws(s) so a single env var configures both adapters.
          const wsBaseUrl = gameApiBaseUrl.replace(/^http/, 'ws');
          // Wrap the bare WebSocket adapter in a backoff-driven reconnect
          // wrapper so an involuntary close (network blip, server restart
          // inside the warm-slot window) is silently retried instead of
          // surfacing the misleading "Connexion perdue" banner. The
          // wrapper exposes the same `GameClient` port; the lobby route
          // sees the `reconnecting` state on `subscribeConnectionState`.
          const gameClient = createReconnectingGameClient({
            inner: createWebSocketGameClient({ wsBaseUrl }),
          });
          // `getSession` is a thin closure over the localStorage helpers
          // so routes don't pull `infrastructure/` into `ui/` directly.
          // Branding is asserted at this single seam. `setPersistedPseudonym`
          // is the write-side counterpart used by the lobby route's
          // `onRename` callback so a chosen pseudonym survives reload.
          const getSession = () => ({
            sessionId: sessionId as SessionId,
            pseudonym: getPseudonym() as Pseudonym,
          });
          const setPersistedPseudonym = (pseudonym: Pseudonym) => {
            setPseudonym(pseudonym);
          };
          return {
            ...baseContext,
            puzzleRepository,
            puzzleSolver,
            wordsRepository,
            sessionClient,
            soloEntriesStore,
            tourSeenStore,
            lobbyClient,
            gameClient,
            getSession,
            setPseudonym: setPersistedPseudonym,
            lobbyJoinCodeStash: sessionStorageLobbyJoinCodeStash,
          };
        })()
      : { ...baseContext, puzzleRepository, puzzleSolver, wordsRepository, sessionClient, soloEntriesStore, tourSeenStore };
    const router = createAppRouter({ context, multiplayer });

    // Track page views on every route resolution. `onResolved` fires after
    // a navigation completes (initial mount included), giving us the canonical
    // matched URL — query strings are kept off the wire by hooking on
    // `location.pathname` only, so a shareable lobby id isn't leaked into
    // analytics as part of the URL.
    router.subscribe('onResolved', (event) => {
      const url = event.toLocation.pathname;
      tracker.trackPageView(url, document.title || undefined);
    });

    // On sign-in: rebind lobby seats only; solo progress reconciles via reconcileOnAuth (ADR-0075).
    const rebindLobby =
      multiplayer && 'lobbyClient' in context
        ? (anonSessionId: string) =>
            context.lobbyClient.rebindLobbySessions(anonSessionId as SessionId)
        : undefined;
    const onAuthed = rebindLobby
      ? async (anonSessionId: string) => {
          await rebindLobby(anonSessionId);
        }
      : undefined;

    // ADR-0088: re-assert the pre-paint theme (covers SPA-restored sessions) and track OS changes under 'auto'.
    const themePref = loadThemePreference();
    applyThemePreference(themePref);
    watchSystemTheme(themePref);

    // onCaughtError only: onUncaughtError would double-emit via the window.error handler.
    const mount = () =>
      createRoot(container, {
        onCaughtError: (error, errorInfo) => {
          if (import.meta.env.DEV) {
            // dev-only: React's default console.error firehose.
            console.error('Caught error:', error, errorInfo);
          }
          reportCaughtError(error, 'react-caught');
        },
      }).render(
        <StrictMode>
          <AuthProvider
            authClient={authClient}
            getPseudonym={getPseudonym}
            getLocalSessionId={getOrCreateSessionId}
            onAuthed={onAuthed}
            progressSyncService={progressSyncService}
          >
            <App router={router} />
          </AuthProvider>
        </StrictMode>,
      );

    // The prerender bakes Ark dialog/menu portals at body level; createRoot only owns #root, so they survive as inert, duplicate-id overlays whose aria-controls shadow the real React portals and swallow menu/dialog clicks. Drop them before mounting.
    document.querySelectorAll('[data-scope]').forEach((el) => {
      if (!container.contains(el)) el.remove();
    });

    // ADR-0072 §3 — gate paint on the UI font (Nunito) only, 800ms cap; Fredoka wordmark swaps in.
    if (typeof document !== 'undefined' && typeof document.fonts?.load === 'function') {
      const ready = document.fonts
        .load('1em "Nunito Variable"')
        .then(() => undefined)
        .catch(() => undefined);
      const cap = new Promise<void>((resolve) => setTimeout(resolve, 800));
      void Promise.race([ready, cap]).then(mount);
    } else {
      mount();
    }

    registerServiceWorker(signalUpdateAvailable);
  });
