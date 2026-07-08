// `/contribuer/pairs` eager half — route definition + head(); lazy UI in `./contribuer.pairs.lazy`.

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

function ContribuerPairsSkeleton() {
  return (
    <ContentPage>
      <article className={skeletonArticleStyles}>
        <h1 className={skeletonHeadingStyles}>{t('route.contribuerPairs.skeletonHeading')}</h1>
        <p className={skeletonIntroStyles}>{t('route.contribuerPairs.skeleton.intro')}</p>
        <p className={skeletonStatusStyles} role="status">{t('route.contribuer.loading')}</p>
      </article>
    </ContentPage>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/contribuer/pairs',
  pendingMs: 0,
  pendingComponent: ContribuerPairsSkeleton,
  head: () =>
    buildHead({
      title: t('seo.noindex.contribuerPairs.title'),
      description: t('seo.noindex.contribuerPairs.description'),
      canonical: `${SITE_BASE_URL}/contribuer/pairs`,
      noindex: true,
    }),
}).lazy(() => import('./contribuer.pairs.lazy').then((m) => m.Route));
