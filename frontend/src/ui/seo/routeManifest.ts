// Single source of truth for SEO-relevant routes. Imported by:
//   - each indexable route file (for its head() data)
//   - frontend/scripts/generate-sitemap.ts (for sitemap.xml)
//   - frontend/scripts/prerender.ts (for the prerender pass)
//   - frontend/tests/seo-*.test.ts (for assertions)
//
// Adding an indexable route is a one-touch change here.

// Read `fr` directly, not `t()`: the Node build scripts import this module without `import.meta.env` (t()'s dev guard) or the `@/` alias.
import { fr } from '../i18n/messages.fr.ts';

export const SITE_BASE_URL = 'https://wordsparrow.io';

export interface IndexableRoute {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  // Path (root-relative, with leading `/`) of the per-route OpenGraph
  // image under `frontend/public/`. The full URL is built as
  // `${SITE_BASE_URL}${ogImagePath}` and used by `buildHead` for
  // `og:image` and `twitter:image`.
  readonly ogImagePath: string;
}

export const INDEXABLE_ROUTES: ReadonlyArray<IndexableRoute> = [
  {
    path: '/',
    title: fr['seo.route.home.title'],
    description: fr['seo.route.home.description'],
    ogImagePath: '/og-home.png',
  },
  {
    path: '/play',
    title: fr['seo.route.play.title'],
    description: fr['seo.route.play.description'],
    ogImagePath: '/og-grille.png',
  },
  {
    path: '/grilles',
    title: fr['seo.route.grilles.title'],
    description: fr['seo.route.grilles.description'],
    // until a dedicated /grilles card ships
    ogImagePath: '/og-home.png',
  },
  {
    path: '/aide',
    title: fr['seo.route.aide.title'],
    description: fr['seo.route.aide.description'],
    ogImagePath: '/og-aide.png',
  },
  {
    path: '/mentions-legales',
    title: fr['seo.route.mentionsLegales.title'],
    description: fr['seo.route.mentionsLegales.description'],
    ogImagePath: '/og-mentions-legales.png',
  },
  {
    path: '/confidentialite',
    title: fr['seo.route.confidentialite.title'],
    description: fr['seo.route.confidentialite.description'],
    ogImagePath: '/og-confidentialite.png',
  },
  {
    path: '/conditions-abonnement',
    title: fr['seo.route.conditionsAbonnement.title'],
    description: fr['seo.route.conditionsAbonnement.description'],
    // reuse mentions-légales OG until a dedicated card ships
    ogImagePath: '/og-mentions-legales.png',
  },
  {
    path: '/a-propos',
    title: fr['seo.route.aPropos.title'],
    description: fr['seo.route.aPropos.description'],
    // reuse mentions-légales OG until a dedicated card ships
    ogImagePath: '/og-mentions-legales.png',
  },
];

export interface PrerenderRoute {
  readonly path: string;
  readonly title: string;
}

// Noindex routes still prerendered so Cloudflare Pages serves the route's own shell, not the home shell.
export const NOINDEX_PRERENDER_ROUTES: ReadonlyArray<PrerenderRoute> = [
  { path: '/compte', title: fr['seo.noindex.compte.title'] },
  { path: '/contribuer', title: fr['seo.noindex.contribuer.title'] },
  { path: '/contribuer/pairs', title: fr['seo.noindex.contribuerPairs.title'] },
  { path: '/signalements', title: fr['seo.noindex.signalements.title'] },
  { path: '/reglages', title: fr['seo.noindex.reglages.title'] },
  { path: '/grilles/a-finir', title: fr['seo.noindex.grillesAFinir.title'] },
  { path: '/grilles/multijoueur', title: fr['seo.noindex.grillesMultijoueur.title'] },
  { path: '/finish', title: fr['seo.noindex.finish.title'] },
  { path: '/abonnement', title: fr['seo.noindex.abonnement.title'] },
  { path: '/abonnement/succes', title: fr['seo.noindex.abonnementSucces.title'] },
  { path: '/abonnement/annule', title: fr['seo.noindex.abonnementAnnule.title'] },
];

export interface ParamShellRoute {
  // TanStack route pattern this shell stands in for (e.g. '/lobby/$lobbyId').
  readonly routePath: string;
  // Concrete URL the prerenderer loads: syntactically valid param, lobby API hung → pendingComponent.
  readonly prerenderPath: string;
  // dist/<outSlug>.html — the target of the route's `_redirects` 200-rewrite.
  readonly outSlug: string;
  // head() never fires on a hung loader, so the prerenderer injects these; keep in sync with the route's noindexHead.
  readonly title: string;
  readonly description: string;
}

// Param routes can't prerender one file per URL; each gets a single loading shell that public/_redirects serves for every concrete path.
export const PARAM_SHELL_ROUTES: ReadonlyArray<ParamShellRoute> = [
  {
    routePath: '/lobby/$lobbyId',
    prerenderPath: '/lobby/7Hk2pQrS',
    outSlug: 'lobby-shell',
    title: fr['seo.shell.lobby.title'],
    description: fr['seo.shell.lobby.description'],
  },
  {
    routePath: '/join/$code',
    prerenderPath: '/join/A2B3C4',
    outSlug: 'join-shell',
    title: fr['seo.shell.join.title'],
    description: fr['seo.shell.join.description'],
  },
];

// Derived from the sources below so this list can't drift from what actually emits noindex.
export const EXCLUDED_ROUTES: ReadonlyArray<string> = [
  ...NOINDEX_PRERENDER_ROUTES.map((r) => r.path),
  ...PARAM_SHELL_ROUTES.map((r) => r.routePath),
];

export const DEFAULT_OG_IMAGE = `${SITE_BASE_URL}/og-home.png`;
