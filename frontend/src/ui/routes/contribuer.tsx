// `/contribuer` eager half — route definition + head(); lazy UI in `./contribuer.lazy`.

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
  fontSize: { base: 'xl', md: 'display' }, fontWeight: 'bold',
  letterSpacing: '-0.02em', margin: 0, color: 'fg',
});
const skeletonIntroStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });
const skeletonStatusStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });

// pendingMs=0 + this skeleton stops the lazy-chunk flash where the previous route's chrome stayed visible.
function ContribuerSkeleton() {
  return (
    <ContentPage>
      <article className={skeletonArticleStyles}>
        <h1 className={skeletonHeadingStyles}>{t('route.contribuer.heading')}</h1>
        <p className={skeletonIntroStyles}>{t('route.contribuer.skeleton.intro')}</p>
        <p className={skeletonStatusStyles} role="status">{t('common.loading')}</p>
      </article>
    </ContentPage>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/contribuer',
  pendingMs: 0,
  pendingComponent: ContribuerSkeleton,
  head: () =>
    buildHead({
      title: t('seo.noindex.contribuer.title'),
      description: t('seo.noindex.contribuer.description'),
      canonical: `${SITE_BASE_URL}/contribuer`,
      noindex: true,
    }),
}).lazy(() => import('./contribuer.lazy').then((m) => m.Route));
