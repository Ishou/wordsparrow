import { createRoute, redirect } from '@tanstack/react-router';
import { Route as AppLayoutRoute } from './app-layout';

// ADR-0074 Wave 2: redirect v1 paths whose name changed so old bookmarks/links keep working.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// `/accueil` → `/` (v2 home).
export const AccueilRedirectRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'accueil',
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});

// `/grille?date=` → `/play?date=`, preserving the daily-grid date param.
export const GrilleRedirectRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'grille',
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === 'string' && ISO_DATE.test(search.date) ? { date: search.date } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/play', search, replace: true });
  },
});

// `/menu` → `/reglages`: the standalone menu screen was superseded by the MenuSheet; réglages carries its content.
export const MenuRedirectRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'menu',
  beforeLoad: () => {
    throw redirect({ to: '/reglages', replace: true });
  },
});

// `/privacy` → `/confidentialite` (EN variant dropped — French-first/tutoiement).
export const PrivacyRedirectRoute = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'privacy',
  beforeLoad: () => {
    throw redirect({ to: '/confidentialite', replace: true });
  },
});
