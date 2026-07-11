/// <reference lib="WebWorker" />
// Hand-authored service worker (vite-plugin-pwa injectManifest). Replaces the generateSW config so the grid-API
// runtime cache can date-scope the daily key — generateSW cannot express a `cacheKeyWillBeUsed` plugin. See ADR-0026,
// ADR-0089. Client registration + the update-prompt handshake stay in infrastructure/pwa.ts.
import { clientsClaim, type WorkboxPlugin } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { buildNavigateFallbackDenylist, dailyScopedCacheKey, isStorablePuzzleResponse } from '@/infrastructure/pwa/swCache';

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __WB_MANIFEST: Array<import('workbox-precaching').PrecacheEntry | string>;
  };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const PRERENDERED_ROUTE_PATHS = [
  '/play',
  '/grilles',
  '/grilles/a-finir',
  '/grilles/multijoueur',
  '/aide',
  '/mentions-legales',
  '/confidentialite',
  '/conditions-abonnement',
  '/a-propos',
  '/compte',
  '/reglages',
  '/finish',
  '/abonnement',
  '/abonnement/succes',
  '/abonnement/annule',
  '/contribuer',
  '/contribuer/pairs',
];
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: buildNavigateFallbackDenylist(PRERENDERED_ROUTE_PATHS),
  }),
);

// Grid API: NetworkFirst so the player gets the freshest puzzle online and the last-loaded one offline (ADR-0026).
// The two plugins close the day-rollover gap (ADR-0089): a date-scoped key rotates each UTC day, and no-store bodies
// (the cookied daily's per-user hint budget) are never persisted.
const dailyFreshness: WorkboxPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => dailyScopedCacheKey(request.url, new Date()),
  cacheWillUpdate: async ({ response }) =>
    isStorablePuzzleResponse(response.status, response.headers.get('Cache-Control')) ? response : null,
};
registerRoute(
  ({ url }) => url.hostname === 'api.wordsparrow.io' && url.pathname.startsWith('/v1/puzzles/'),
  new NetworkFirst({
    cacheName: 'grid-api-puzzles',
    networkTimeoutSeconds: 5,
    plugins: [dailyFreshness, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
);

// registerType: 'prompt' + skipWaiting: false — a new SW waits; pwa.ts posts SKIP_WAITING on user accept (ADR-0026).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();
