// Service-worker registration for the PWA + offline cache.
//
// `vite-plugin-pwa` generates `/sw.js` from `src/sw.ts` (injectManifest:
// precaches the app shell, NetworkFirst for puzzle GETs). This module
// wires browser registration via workbox-window. A freshly precached SW
// waits (`skipWaiting: false`); we swap it in **transparently** — only
// while the tab is hidden — so the reload never flashes in front of the
// player (ADR-0026 2026-07-16 amendment).
//
// Skipped in dev (`import.meta.env.DEV`) so HMR isn't shadowed by a
// cached shell.

import { Workbox } from 'workbox-window';
import { reportCaughtError } from '@/infrastructure/observability/otelTracer';

// timestamp of last chunk-mismatch reload; time-windowed per ADR-0026
const CHUNK_RELOAD_AT = 'bliss.chunk-mismatch-reload-at';

// suppression window; second error within span = infinite-reload guard (ADR-0026)
const CHUNK_RELOAD_WINDOW_MS = 10_000;

// vite:preloadError recovery — see ADR-0026 for the vanished-chunk flow
function installChunkMismatchGuard(wb: Workbox, reload: () => void): void {
  window.addEventListener('vite:preloadError', (event: Event) => {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_AT) ?? '0');
    if (Date.now() - last < CHUNK_RELOAD_WINDOW_MS) return;
    sessionStorage.setItem(CHUNK_RELOAD_AT, String(Date.now()));
    event.preventDefault();
    void wb.update().finally(reload);
  });
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;
  // Preview mode runs MSW's own service worker at scope `/`. Registering
  // workbox here would race MSW for that scope: workbox's `controlling`
  // event would fire on every page load and reload the visible tab immediately, and the preview would refresh
  // forever. Match `main.tsx`'s MSW gate exactly — skip whenever either
  // surface mock is on. Production sets both to `false` in `.env`.
  if (
    import.meta.env.VITE_MOCK_GRID_API === 'true' ||
    import.meta.env.VITE_MOCK_GAME_API === 'true'
  ) {
    return;
  }

  const start = () => {
    // `updateViaCache: 'none'` forces the browser to fetch `/sw.js`
    // from the network on every registration call, instead of trusting
    // its HTTP cache for up to 24 h. Without this, a normal F5 can
    // serve a stale SW and miss a deploy until the user does Ctrl+F5
    // — the symptom that motivated this module's last revision.
    const wb = new Workbox('/sw.js', { updateViaCache: 'none' });
    let refreshing = false;

    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    installChunkMismatchGuard(wb, reloadOnce);

    // Transparent update (ADR-0026 2026-07-16 amendment): swap to the new SW
    // only while the tab is hidden, so the player never witnesses the reload.
    // A visible tab keeps running the loaded version until they switch away or
    // reopen — then they silently come back to the new one. localStorage keeps
    // puzzle state across the reload (ADR-0026).
    let skipWaitingSent = false;
    const sendSkipWaiting = () => {
      if (skipWaitingSent) return;
      skipWaitingSent = true;
      void wb.messageSkipWaiting(); // waiting SW activates → `controlling` → reloadOnce
    };

    const applyWhenHidden = () => {
      if (skipWaitingSent) return;
      if (document.visibilityState === 'hidden') {
        sendSkipWaiting();
        return;
      }
      const onHidden = () => {
        if (document.visibilityState !== 'hidden') return;
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('pagehide', onHidden);
        sendSkipWaiting();
      };
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', onHidden);
    };

    // Reload only for an update we initiated, and only once. The initial-install
    // `controlling` (first visit) and a background tab's activation both leave
    // `skipWaitingSent` false, so neither reloads this tab unprompted.
    wb.addEventListener('controlling', () => {
      if (skipWaitingSent) reloadOnce();
    });

    // A new SW finished installing and is waiting to activate.
    wb.addEventListener('waiting', applyWhenHidden);

    wb.register()
      .then((registration) => {
        // Catch a SW that was already waiting before this listener attached.
        if (registration?.waiting) applyWhenHidden();
      })
      .catch((err: unknown) => {
        // Non-fatal; surfaces in SigNoz so we notice sudden upticks without DevTools.
        reportCaughtError(err, 'pwa-register-failed');
      });
  };

  // `registerServiceWorker` is called from `main.tsx` after async MSW
  // init resolves, which often lands after `window`'s `load` event has
  // already fired. `addEventListener('load', ...)` does not fire
  // retroactively, so we branch on `document.readyState` to register
  // synchronously when we've missed the boat.
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
}
