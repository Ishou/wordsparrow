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

const thanksCard = css({
  bg: 'ws.sakuraBlush',
  borderRadius: '18px',
  padding: '18px 20px',
});

const thanksText = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  lineHeight: '1.65',
  color: 'ws.contentInk',
  margin: 0,
  '& + &': { marginTop: '10px' },
});

export function AProposScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>À propos</h1>
          <p className={lede}>Un petit jeu de mots fléchés à la française, fait avec soin.</p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Le projet</h2>
          <p className={sectionBody}>
            Je m&apos;appelle <strong>Colin Auberger</strong> et je développe WordSparrow seul, en
            France.
          </p>
          <p className={sectionBody}>
            C&apos;est autant un jeu qu&apos;un terrain d&apos;apprentissage : je le fais pour
            progresser, pour le plaisir du travail soigné, et avec l&apos;envie qu&apos;on ait plaisir
            à l&apos;ouvrir chaque matin. Pas de grande équipe derrière — deux mains, beaucoup de
            patience.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>L&apos;intelligence artificielle</h2>
          <p className={sectionBody}>
            Autant être clair sur la fabrication des définitions : elles sont rédigées par un modèle
            de langage, que j&apos;entraîne et affine au fil du temps. Le résultat n&apos;est pas
            encore parfait — il reste des définitions maladroites — et je continue de le peaufiner.
          </p>
          <p className={sectionBody}>
            L&apos;IA me permet de faire vivre le projet à moindre coût, le temps qu&apos;il trouve son
            public. Le jour où WordSparrow gagnera de l&apos;argent, je veux le consacrer à de vraies
            plumes : des auteurs payés pour écrire les définitions.
          </p>
        </section>

        <section className={thanksCard}>
          <h2 className={sectionHeading}>Remerciements</h2>
          <p className={thanksText}>
            WordSparrow ne tient pas debout tout seul. Il repose sur des logiciels libres et sur des
            polices d&apos;écriture offertes à tous.
          </p>
          <p className={thanksText}>
            Rien de tout cela ne nous appartient vraiment : on en hérite, et on essaie d&apos;en
            prendre soin. Voici celles et ceux à qui l&apos;on doit un grand merci.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Le code et les outils</h2>
          <p className={sectionBody}>
            Le jeu tourne grâce à des logiciels libres, écrits et entretenus par une foule de gens
            qu&apos;on ne croisera jamais.
          </p>
          <p className={sectionBody}>
            Ils sont bien trop nombreux pour tenir ici :{' '}
            <a className={link} href="/third-party-licenses.txt">
              la liste complète des licences
            </a>{' '}
            les cite un à un.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Les lettres</h2>
          <p className={sectionBody}>
            Les mots méritent de belles lettres. Nos polices d&apos;écriture ont été dessinées puis
            partagées librement, sous licence SIL Open Font, par des créateurs typographiques.
          </p>
          <p className={sectionBody}>
            Merci aux polices{' '}
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
            , et aux mains patientes qui les ont tracées.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>La langue et les mots</h2>
          <p className={sectionBody}>
            Sans dictionnaire, pas de grille. Notre vocabulaire vient d&apos;un long travail de
            recensement du français, mot après mot, année après année.
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
            et à son dictionnaire français, au <strong>Hunspell français</strong>, et à{' '}
            <a
              className={link}
              href="https://kaiko.getalp.org/about-dbnary/"
              target="_blank"
              rel="noopener noreferrer"
            >
              DBnary
            </a>
            , le Wiktionnaire mis en données ouvertes.
          </p>
        </section>
      </article>
    </PhoneShell>
  );
}
