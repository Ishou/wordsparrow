// Service-worker registration for the PWA + offline cache.
//
// `vite-plugin-pwa` generates the actual `/sw.js` from the workbox
// config in `vite.config.ts` (precaches the app shell, NetworkFirst for
// puzzle GETs). This module wires browser registration via the
// workbox-window helper, which fits the plugin's `registerType:
// 'autoUpdate'` mode: a freshly precached SW activates on the next
// page load without prompting.
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
  // event would fire on every page load, the fresh-load reload window
  // would trigger `location.reload()`, and the preview would refresh
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
    let staleVisibilityListener: (() => void) | null = null;

    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    installChunkMismatchGuard(wb, reloadOnce);

    const armDeferredReload = () => {
      if (staleVisibilityListener) return;
      staleVisibilityListener = () => {
        if (document.visibilityState === 'visible') reloadOnce();
      };
      document.addEventListener('visibilitychange', staleVisibilityListener);
    };

    // Real update (workbox suppresses the first install). Puzzle state lives in localStorage so reloading is safe (ADR-0026): reload a visible tab now so it lands on the new build; defer a hidden tab until it's next shown (a >3s SW install on mobile used to defer a visible tab forever, stranding it on the old build).
    wb.addEventListener('controlling', () => {
      if (document.visibilityState === 'visible') {
        reloadOnce();
        return;
      }
      armDeferredReload();
    });

    wb.register().catch((err: unknown) => {
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
