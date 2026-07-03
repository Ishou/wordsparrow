import type { ReactNode } from 'react';
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
const kbd = css({
  display: 'inline-block',
  fontFamily: 'wsMono',
  fontSize: '0.82em',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  bg: 'ws.sable',
  border: '1px solid rgba(33,75,64,0.14)',
  borderRadius: '6px',
  padding: '1px 6px',
  boxShadow: '0 1px 0 rgba(33,75,64,0.12)',
  whiteSpace: 'nowrap',
});

function Section({ heading, children }: { readonly heading: string; readonly children: ReactNode }) {
  return (
    <section className={contentCard}>
      <h2 className={sectionHeading}>{heading}</h2>
      <p className={sectionBody}>{children}</p>
    </section>
  );
}

export function AideScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <div className={eyebrow}>Besoin d&apos;un coup de main&nbsp;?</div>
          <h1 className={title}>Aide</h1>
          <p className={lede}>L&apos;essentiel pour jouer, en quelques mots.</p>
        </header>

        <Section heading="Comment jouer">
          Touche une case puis tape une lettre. Les flèches du clavier te déplacent dans la grille en
          évitant les cases d&apos;indices. Au carrefour de deux mots, appuie sur <kbd className={kbd}>Espace</kbd> pour
          basculer entre les deux directions.
        </Section>

        <Section heading="Raccourcis clavier">
          <kbd className={kbd}>← ↑ ↓ →</kbd> pour te déplacer, <kbd className={kbd}>Espace</kbd> pour changer de
          direction à un carrefour, <kbd className={kbd}>Retour</kbd> pour effacer une lettre, et{' '}
          <kbd className={kbd}>Tab</kbd> pour passer au mot suivant.
        </Section>

        <Section heading="Validation et indices">
          En solo, rien ne se valide au fil de la saisie&nbsp;: une fois toutes les cases remplies, ta grille
          est vérifiée d&apos;un coup et tu sais si elle est juste ou non. Si tu bloques, demande un indice via
          le bouton dédié dans le bandeau&nbsp;: il révèle le mot entier sur lequel tu es (nombre limité par
          grille).
        </Section>

        <Section heading="Jouer à plusieurs">
          Crée une partie à plusieurs depuis l&apos;accueil et partage le lien&nbsp;: tout le monde joue la même
          grille, en même temps.
        </Section>

        <Section heading="Installer l&apos;application">
          WordSparrow s&apos;installe comme une app&nbsp;: grille en plein écran, lancement depuis ton écran
          d&apos;accueil. Sur Android et sur ordinateur, passe par «&nbsp;Installer l&apos;application&nbsp;» dans les
          Réglages. Sur iPhone et iPad&nbsp;: bouton Partager de Safari, puis
          «&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;».
        </Section>
      </article>
    </PhoneShell>
  );
}
