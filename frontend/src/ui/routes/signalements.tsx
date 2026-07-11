// `/signalements` eager half — route definition + head(); lazy UI in `./signalements.lazy`.

import { createRoute } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { ContentPage } from '@/ui/components/layout';
import { buildHead, SITE_BASE_URL } from '@/ui/seo';
import { t } from '@/ui/i18n';
import { Route as RootRoute } from './__root';

const skeletonArticleStyles = css({
  display: 'flex', flexDirection: 'column', gap: 'lg', width: '100%', maxWidth: '720px',
});
const skeletonHeadingStyles = css({
  fontSize: { base: 'xl', md: 'display' }, fontWeight: 'black',
  letterSpacing: '-0.02em', margin: 0, color: 'fg',
});
const skeletonStatusStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });

// pendingMs=0 + this skeleton stops the lazy-chunk flash where the previous route's chrome stayed visible.
function SignalementsSkeleton() {
  return (
    <ContentPage>
      <article className={skeletonArticleStyles}>
        <h1 className={skeletonHeadingStyles}>{t('route.signalements.heading')}</h1>
        <p className={skeletonStatusStyles} role="status">{t('common.loading')}</p>
      </article>
    </ContentPage>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/signalements',
  pendingMs: 0,
  pendingComponent: SignalementsSkeleton,
  head: () =>
    buildHead({
      title: t('seo.noindex.signalements.title'),
      description: t('seo.noindex.signalements.description'),
      canonical: `${SITE_BASE_URL}/signalements`,
      noindex: true,
    }),
}).lazy(() => import('./signalements.lazy').then((m) => m.Route));
