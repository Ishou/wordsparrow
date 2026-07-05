import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { contentCard, lede, sectionBody, sectionHeading } from './contentPage';

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

const introCard = css({
  bg: 'ws.sakuraBlush',
  borderRadius: '18px',
  padding: '18px 20px',
});

const introText = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  lineHeight: '1.65',
  color: 'ws.contentInk',
  margin: 0,
  '& + &': { marginTop: '10px' },
});

const closing = css({
  fontFamily: 'wsUi',
  fontSize: '14px',
  lineHeight: '1.6',
  color: 'ws.khaki',
  textAlign: 'center',
  margin: 0,
  paddingTop: '4px',
});

export function RemerciementsScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>Merci</h1>
          <p className={lede}>Derrière chaque grille, il y a le travail partagé d&apos;autres.</p>
        </header>

        <section className={introCard}>
          <p className={introText}>
            WordSparrow n&apos;existerait pas seul. On l&apos;a construit sur des logiciels libres,
            avec des fontes offertes au monde et des mots patiemment rassemblés par des bénévoles.
            Rien de tout ça ne nous appartient vraiment — on en hérite, et on en prend soin.
          </p>
          <p className={introText}>Voici celles et ceux à qui l&apos;on doit un grand merci.</p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Le code et les outils</h2>
          <p className={sectionBody}>
            Le jeu tourne sur des logiciels libres, écrits et entretenus par une foule de gens qu&apos;on
            ne croisera jamais.
          </p>
          <p className={sectionBody}>
            Merci à{' '}
            <a className={link} href="https://react.dev" target="_blank" rel="noopener noreferrer">
              React
            </a>
            ,{' '}
            <a
              className={link}
              href="https://tanstack.com/router"
              target="_blank"
              rel="noopener noreferrer"
            >
              TanStack Router
            </a>
            ,{' '}
            <a className={link} href="https://panda-css.com" target="_blank" rel="noopener noreferrer">
              Panda CSS
            </a>
            ,{' '}
            <a className={link} href="https://ark-ui.com" target="_blank" rel="noopener noreferrer">
              Ark UI
            </a>
            ,{' '}
            <a
              className={link}
              href="https://phosphoricons.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Phosphor Icons
            </a>
            ,{' '}
            <a
              className={link}
              href="https://opentelemetry.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenTelemetry
            </a>
            ,{' '}
            <a className={link} href="https://kotlinlang.org" target="_blank" rel="noopener noreferrer">
              Kotlin
            </a>{' '}
            &amp;{' '}
            <a className={link} href="https://ktor.io" target="_blank" rel="noopener noreferrer">
              Ktor
            </a>
            ,{' '}
            <a
              className={link}
              href="https://www.postgresql.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              PostgreSQL
            </a>
            ,{' '}
            <a className={link} href="https://www.mollie.com" target="_blank" rel="noopener noreferrer">
              Mollie
            </a>{' '}
            — et à tout l&apos;écosystème qui les entoure.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Les lettres</h2>
          <p className={sectionBody}>
            Les mots méritent de belles lettres. Nos fontes viennent de créateurs typographiques qui
            les ont libérées sous licence SIL Open Font, pour que chacun puisse les faire vivre.
          </p>
          <p className={sectionBody}>
            Merci aux fontes{' '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Fredoka"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fredoka
            </a>
            ,{' '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Nunito"
              target="_blank"
              rel="noopener noreferrer"
            >
              Nunito
            </a>
            ,{' '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Hanken+Grotesk"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hanken Grotesk
            </a>{' '}
            et{' '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Spline+Sans+Mono"
              target="_blank"
              rel="noopener noreferrer"
            >
              Spline Sans Mono
            </a>
            , et aux gens patients qui les ont dessinées.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>La langue et les mots</h2>
          <p className={sectionBody}>
            Sans dictionnaire, pas de grille. On doit notre vocabulaire à des lexicographes bénévoles
            qui recensent et corrigent le français, mot après mot, depuis des années.
          </p>
          <p className={sectionBody}>
            Merci à{' '}
            <a
              className={link}
              href="https://grammalecte.net"
              target="_blank"
              rel="noopener noreferrer"
            >
              Grammalecte
            </a>{' '}
            et au projet{' '}
            <a
              className={link}
              href="https://grammalecte.net/home.php?prj=fr"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dicollecte
            </a>
            , au dictionnaire <strong>Hunspell français</strong>, et à{' '}
            <a
              className={link}
              href="https://kaiko.getalp.org/about-dbnary/"
              target="_blank"
              rel="noopener noreferrer"
            >
              DBnary
            </a>
            .
          </p>
        </section>

        <p className={closing}>
          On ne raconte ici qu&apos;une partie de l&apos;histoire :{' '}
          <a className={link} href="/third-party-licenses.txt">
            la liste complète des licences
          </a>{' '}
          est là si tu veux le détail.
        </p>
      </article>
    </PhoneShell>
  );
}
