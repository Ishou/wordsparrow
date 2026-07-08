import { Navigate, createRoute } from '@tanstack/react-router';
// Sanctioned app→module bridge (ADR-0072).
import { ConnexionScreen } from '@/ui/v2/ConnexionScreen';
import { useAuth } from '@/ui/components/auth';
import { t } from '@/ui/i18n';
import { Route as AppLayoutRoute } from './app-layout';

function ConnexionRouteComponent() {
  const { returnTo } = Route.useSearch();
  const { status } = useAuth();
  // Withhold the form until the initial whoami() resolves — otherwise an
  // already-authed visitor sees the OTP form flash before the redirect.
  if (status === 'loading') return null;
  // Already signed in — the OTP flow would be a dead end, so bounce to the destination.
  if (status === 'authed') return <Navigate to={returnTo ?? '/'} replace />;
  return <ConnexionScreen returnTo={returnTo ?? '/'} />;
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'connexion',
  // `?returnTo=` is honoured only for same-origin internal paths so a crafted absolute URL can't open-redirect after sign-in.
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === 'string' && search.returnTo.startsWith('/') && !search.returnTo.startsWith('//')
      ? { returnTo: search.returnTo }
      : {},
  component: ConnexionRouteComponent,
  // Title (a11y) + robots-noindex only while dark; the full noindex head + prerender shell land in the manifest with the bright release (ADR-0091 Wave 5).
  head: () => ({
    meta: [
      { title: t('seo.noindex.connexion.title') },
      { name: 'robots', content: 'noindex,follow' },
    ],
  }),
});
