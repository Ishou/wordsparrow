import { createRoute, Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { ContentPage } from '@/ui/components/layout';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

const articleStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'lg',
  width: '100%',
  maxWidth: '720px',
});
const headingStyles = css({
  fontSize: { base: 'xl', md: 'display' },
  fontWeight: 'bold',
  letterSpacing: '-0.02em',
  margin: 0,
  color: 'fg',
});
const statusStyles = css({ fontSize: 'body', color: 'fg', fontWeight: 'medium', margin: 0 });
const leadStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });
// ws.sakuraDark (not ws.sakura) clears WCAG AA for white-on-colour — known palette gotcha.
const linkStyles = css({
  fontSize: 'body',
  color: 'ws.sakuraDark',
  fontWeight: 'medium',
  textDecoration: 'underline',
});

export function CheckoutCancelScreen() {
  return (
    <article className={articleStyles}>
      <h1 className={headingStyles}>Paiement annulé</h1>
      <p className={statusStyles} role="status">
        Aucun montant n'a été débité.
      </p>
      <p className={leadStyles}>
        WordSparrow reste gratuit. Si tu changes d'avis, tu peux relancer l'abonnement quand tu
        veux.
      </p>
      <p className={leadStyles}>
        <Link to="/abonnement" className={linkStyles}>
          Revenir à mon abonnement
        </Link>
      </p>
    </article>
  );
}

function CheckoutCancelRouteComponent() {
  return (
    <ContentPage>
      <CheckoutCancelScreen />
    </ContentPage>
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'abonnement/annule',
  component: CheckoutCancelRouteComponent,
  head: () =>
    noindexHead('Paiement annulé — WordSparrow', 'Ton paiement a été annulé, aucun débit.'),
});
