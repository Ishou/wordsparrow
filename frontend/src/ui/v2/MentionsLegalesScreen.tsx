import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

const article = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  color: 'ws.khaki',
  '& h1': {
    fontFamily: 'wsDisplay',
    fontWeight: 'semibold',
    fontSize: '28px',
    lineHeight: '1.1',
    color: 'ws.jadeInk',
    margin: 0,
  },
  '& h2': {
    fontFamily: 'wsDisplay',
    fontWeight: 'semibold',
    fontSize: '17px',
    color: 'ws.jadeInk',
    marginTop: '14px',
    marginBottom: 0,
  },
  '& p': {
    fontFamily: 'wsUi',
    fontSize: '15px',
    lineHeight: '1.6',
    margin: 0,
  },
  '& a': {
    color: 'ws.sakura',
    fontWeight: 'semibold',
    textDecoration: 'underline',
  },
  '& strong': { fontWeight: 'bold', color: 'ws.jadeInk' },
});

export function MentionsLegalesScreen() {
  return (
    <PhoneShell header={<BackHeader />}>
      <article className={article}>
        <h1>Mentions légales</h1>

        <h2>Éditeur</h2>
        <p>
          WordSparrow est édité par <strong>Colin Auberger</strong>, contact :{' '}
          <a href="mailto:contact@wordsparrow.io">contact@wordsparrow.io</a>.
        </p>

        <h2>Hébergement</h2>
        <p>
          Le service est hébergé par <strong>Hetzner Online GmbH</strong>,
          Industriestr. 25, 91710 Gunzenhausen, Allemagne (
          <a href="https://www.hetzner.com" target="_blank" rel="noopener noreferrer">
            hetzner.com
          </a>
          ). La diffusion du contenu statique et la résolution DNS sont assurées par{' '}
          <strong>Cloudflare, Inc.</strong>, 101 Townsend St, San Francisco, CA 94107,
          États-Unis (
          <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">
            cloudflare.com
          </a>
          ).
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          Le code source de WordSparrow est publié sous licence FSL-1.1-MIT (Functional
          Source License 1.1, Apache MIT future). Voir le dépôt public du projet pour les
          conditions d&apos;utilisation, de modification et de redistribution.
        </p>

        <h2>Données personnelles</h2>
        <p>
          Le traitement de tes données personnelles est décrit dans la{' '}
          <Link to="/v2/confidentialite">politique de confidentialité</Link>.
        </p>

        <h2>Signaler un problème</h2>
        <p>
          Pour signaler un contenu illicite, un bug ou une faille de sécurité, écris à{' '}
          <a href="mailto:contact@wordsparrow.io">contact@wordsparrow.io</a>.
        </p>
      </article>
    </PhoneShell>
  );
}
