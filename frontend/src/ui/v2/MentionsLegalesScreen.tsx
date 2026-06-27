import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { contentCard, eyebrow, lede, sectionBody, sectionHeading } from './contentPage';

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '0 0 4px',
});

const stack = css({ display: 'flex', flexDirection: 'column', gap: '14px' });

const link = css({ color: 'ws.sakuraDark', fontWeight: 'bold', textDecoration: 'underline' });

export function MentionsLegalesScreen() {
  return (
    <PhoneShell header={<BackHeader to="/v2/reglages" />}>
      <article className={stack}>
        <header>
          <div className={eyebrow}>Informations légales</div>
          <h1 className={title}>Mentions légales</h1>
          <p className={lede}>
            L&apos;essentiel sur l&apos;éditeur du jeu, l&apos;hébergement et tes droits.
          </p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Éditeur</h2>
          <p className={sectionBody}>
            WordSparrow est édité par <strong>Colin Auberger</strong>, contact :{' '}
            <a className={link} href="mailto:contact@wordsparrow.io">
              contact@wordsparrow.io
            </a>
            .
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Hébergement</h2>
          <p className={sectionBody}>
            Le service est hébergé par <strong>Hetzner Online GmbH</strong>, Industriestr. 25,
            91710 Gunzenhausen, Allemagne (
            <a className={link} href="https://www.hetzner.com" target="_blank" rel="noopener noreferrer">
              hetzner.com
            </a>
            ). La diffusion du contenu statique et la résolution DNS sont assurées par{' '}
            <strong>Cloudflare, Inc.</strong>, 101 Townsend St, San Francisco, CA 94107, États-Unis (
            <a className={link} href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>
            ).
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Propriété intellectuelle</h2>
          <p className={sectionBody}>
            Le code source de WordSparrow est publié sous licence FSL-1.1-MIT (Functional Source
            License 1.1, Apache MIT future). Voir le dépôt public du projet pour les conditions
            d&apos;utilisation, de modification et de redistribution.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Données personnelles</h2>
          <p className={sectionBody}>
            Le traitement de tes données personnelles est décrit dans la{' '}
            <Link className={link} to="/v2/confidentialite">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Signaler un problème</h2>
          <p className={sectionBody}>
            Pour signaler un contenu illicite, un bug ou une faille de sécurité, écris à{' '}
            <a className={link} href="mailto:contact@wordsparrow.io">
              contact@wordsparrow.io
            </a>
            .
          </p>
        </section>
      </article>
    </PhoneShell>
  );
}
