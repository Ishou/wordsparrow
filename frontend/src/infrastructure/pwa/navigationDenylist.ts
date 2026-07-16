// Pure navigation-fallback denylist for the offline SW (ADR-0026/0053/0089): prerendered routes are served per-route by Cloudflare, so the SPA-shell fallback must skip them plus the API/asset paths; kept DOM/WebWorker-agnostic for the SW project + unit tests.
export const PRERENDERED_ROUTE_PATHS = [
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
  '/signalements',
  '/signalements/historique',
  '/finish',
  '/abonnement',
  '/abonnement/succes',
  '/abonnement/annule',
  '/contribuer',
  '/contribuer/pairs',
] as const;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `/?(\?.*)?$` keeps trailing-slash and query-string URLs (e.g. /play?date=…) denied so the SW never serves the home shell for them.
export const navigateFallbackDenylist: RegExp[] = [
  /^\/v1\//,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
  /^\/third-party-licenses\.txt$/,
  ...PRERENDERED_ROUTE_PATHS.map((p) => new RegExp(`^${escapeRegExp(p)}/?(\\?.*)?$`)),
  /^\/lobby\//,
  /^\/join\//,
];
