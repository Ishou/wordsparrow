// Per-route head builder for indexable and excluded routes.
//
// Returns the TanStack Router `head()` return shape: a `{ meta, links }`
// object whose entries are passed verbatim to the document <head> via
// the <HeadContent /> component mounted in __root.tsx.
//
// One source of truth for the canonical URL, OG tags, Twitter card,
// and the optional `noindex` flag. Tested in seo-build-head.test.ts.

import { DEFAULT_OG_IMAGE, INDEXABLE_ROUTES, SITE_BASE_URL } from './routeManifest';
import { breadcrumbJsonLd } from './jsonLd';

export interface BuildHeadInput {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly noindex?: boolean;
  // Absolute URL of the per-route OpenGraph image. When omitted, the
  // shared `DEFAULT_OG_IMAGE` is used (current behavior for excluded
  // routes that ship no per-route artwork).
  readonly ogImage?: string;
}

export interface RouteHead {
  readonly meta: Array<Record<string, string>>;
  readonly links: Array<Record<string, string>>;
}

export function buildHead(input: BuildHeadInput): RouteHead {
  const { title, description, canonical, noindex = false, ogImage } = input;
  const image = ogImage ?? DEFAULT_OG_IMAGE;

  const meta: Array<Record<string, string>> = [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'WordSparrow' },
    { property: 'og:locale', content: 'fr_FR' },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];

  if (noindex) {
    meta.push({ name: 'robots', content: 'noindex,follow' });
  }

  return {
    meta,
    links: [{ rel: 'canonical', href: canonical }],
  };
}

// head() for an indexable route, sourced from the manifest by its root-relative path.
export function indexableHead(path: string): RouteHead {
  const route = INDEXABLE_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`No indexable route registered for ${path}`);
  return buildHead({
    title: route.title,
    description: route.description,
    canonical: `${SITE_BASE_URL}${path}`,
    ogImage: `${SITE_BASE_URL}${route.ogImagePath}`,
  });
}

// head() for a route that must not be indexed (account, lobby, join share-link).
export function noindexHead(title: string, description: string): RouteHead {
  return buildHead({ title, description, canonical: SITE_BASE_URL, noindex: true });
}

// indexableHead + a BreadcrumbList (Accueil → this route) for a non-home indexable child.
export function indexableHeadWithBreadcrumb(path: string): RouteHead & {
  readonly scripts: Array<{ type: string; children: string }>;
} {
  const route = INDEXABLE_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`No indexable route registered for ${path}`);
  return {
    ...indexableHead(path),
    scripts: [
      {
        type: 'application/ld+json',
        children: breadcrumbJsonLd([
          { name: 'Accueil', item: `${SITE_BASE_URL}/` },
          { name: route.title, item: `${SITE_BASE_URL}${path}` },
        ]),
      },
    ],
  };
}
