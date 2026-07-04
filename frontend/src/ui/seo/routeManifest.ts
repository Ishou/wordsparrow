// Single source of truth for SEO-relevant routes. Imported by:
//   - each indexable route file (for its head() data)
//   - frontend/scripts/generate-sitemap.ts (for sitemap.xml)
//   - frontend/scripts/prerender.ts (for the prerender pass)
//   - frontend/tests/seo-*.test.ts (for assertions)
//
// Adding an indexable route is a one-touch change here.

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
    title: 'WordSparrow — mots fléchés français en ligne',
    description:
      'Jouez aux mots fléchés en français, en solo ou en multijoueur. Gratuit, sans inscription.',
    ogImagePath: '/og-home.png',
  },
  {
    path: '/play',
    title: 'Grille du jour — WordSparrow',
    description: 'Résolvez la grille de mots fléchés du jour, en français.',
    ogImagePath: '/og-grille.png',
  },
  {
    path: '/grilles',
    title: 'Anciennes grilles — WordSparrow',
    description:
      'Toutes les grilles passées de WordSparrow, avec votre progression.',
    // until a dedicated /grilles card ships
    ogImagePath: '/og-home.png',
  },
  {
    path: '/aide',
    title: 'Aide — WordSparrow',
    description:
      'Comment jouer aux mots fléchés sur WordSparrow : règles, astuces, raccourcis.',
    ogImagePath: '/og-aide.png',
  },
  {
    path: '/mentions-legales',
    title: 'Mentions légales — WordSparrow',
    description:
      'Mentions légales et informations éditoriales de WordSparrow.',
    ogImagePath: '/og-mentions-legales.png',
  },
  {
    path: '/confidentialite',
    title: 'Confidentialité — WordSparrow',
    description: 'Politique de confidentialité de WordSparrow.',
    ogImagePath: '/og-confidentialite.png',
  },
  {
    path: '/conditions-abonnement',
    title: "Conditions générales de vente — WordSparrow",
    description: "Conditions générales de vente de l'abonnement WordSparrow.",
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
  { path: '/compte', title: 'Mon compte — WordSparrow' },
  { path: '/contribuer', title: 'Campagne — WordSparrow' },
  { path: '/contribuer/pairs', title: 'Campagne par paires — WordSparrow' },
  { path: '/reglages', title: 'Réglages — WordSparrow' },
  { path: '/finish', title: 'Partie terminée — WordSparrow' },
  { path: '/abonnement', title: 'Abonnement — WordSparrow' },
  { path: '/abonnement/succes', title: 'Merci — WordSparrow' },
  { path: '/abonnement/annule', title: 'Paiement annulé — WordSparrow' },
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
    title: 'Partie — WordSparrow',
    description: 'Partie de mots fléchés en multijoueur.',
  },
  {
    routePath: '/join/$code',
    prerenderPath: '/join/A2B3C4',
    outSlug: 'join-shell',
    title: 'Rejoindre une partie — WordSparrow',
    description: 'Rejoins une partie de mots fléchés.',
  },
];

// Derived from the sources below so this list can't drift from what actually emits noindex.
export const EXCLUDED_ROUTES: ReadonlyArray<string> = [
  ...NOINDEX_PRERENDER_ROUTES.map((r) => r.path),
  ...PARAM_SHELL_ROUTES.map((r) => r.routePath),
];

export const DEFAULT_OG_IMAGE = `${SITE_BASE_URL}/og-home.png`;
