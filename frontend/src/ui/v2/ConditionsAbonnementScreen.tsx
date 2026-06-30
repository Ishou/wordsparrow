import { Link } from '@tanstack/react-router';
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

const draftNote = css({
  fontFamily: 'wsUi',
  fontSize: '13px',
  lineHeight: '1.5',
  color: 'ws.jadeInk',
  bg: 'ws.sable',
  border: '1px solid #C9BE96',
  borderRadius: '12px',
  padding: '12px 14px',
  '& strong': { fontWeight: 'black' },
});

const updated = css({
  fontFamily: 'wsUi',
  fontSize: '12px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  margin: '2px 0 0',
});

export function ConditionsAbonnementScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>Conditions d&apos;abonnement</h1>
          <p className={lede}>
            Les conditions générales de vente de l&apos;abonnement WordSparrow : ce que tu obtiens,
            le prix, et tes droits.
          </p>
        </header>

        <p className={draftNote} role="note">
          <strong>Brouillon — en cours de validation.</strong> Ces conditions ne sont pas encore
          définitives.
        </p>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Le vendeur</h2>
          <p className={sectionBody}>
            L&apos;abonnement WordSparrow est proposé par <strong>Colin Auberger</strong>, exploitant
            en EURL. Raison sociale : [à compléter]. SIREN / RCS : [à compléter]. TVA
            intracommunautaire : [à compléter]. Siège social : [à compléter]. Contact :{' '}
            <a className={link} href="mailto:contact@wordsparrow.io">
              contact@wordsparrow.io
            </a>
            .
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>L&apos;abonnement</h2>
          <p className={sectionBody}>
            L&apos;abonnement te donne un <strong>accès complet</strong> à WordSparrow : toutes les
            grilles et la génération de grilles. Le jeu de base reste gratuit, sans abonnement : la
            grille du jour, les sept derniers jours et tes grilles déjà commencées.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Prix</h2>
          <p className={sectionBody}>
            <strong>2 €/mois</strong> ou <strong>20 €/an</strong>, TTC (TVA française incluse).
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Paiement et reconduction</h2>
          <p className={sectionBody}>
            Le paiement se fait par carte, en prélèvement récurrent, via notre prestataire de
            paiement. L&apos;abonnement est reconduit tacitement à chaque échéance (mensuelle ou
            annuelle) jusqu&apos;à ce que tu le résilies.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Durée et résiliation</h2>
          <p className={sectionBody}>
            L&apos;abonnement est sans engagement : tu peux le résilier à tout moment depuis ton
            espace abonnement. La résiliation prend effet à la fin de la période déjà payée ; il
            n&apos;y a pas de remboursement au prorata. [politique de remboursement à confirmer].
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Droit de rétractation</h2>
          <p className={sectionBody}>
            Tu disposes en principe d&apos;un délai légal de rétractation de 14 jours. En demandant
            l&apos;accès immédiat au contenu numérique, tu acceptes que l&apos;exécution commence
            tout de suite et tu renonces expressément à ton droit de rétractation. [formulation à
            valider].
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Données personnelles</h2>
          <p className={sectionBody}>
            Le traitement de tes données est décrit dans la{' '}
            <Link className={link} to="/confidentialite">
              politique de confidentialité
            </Link>
            . Notre prestataire de paiement traite les données nécessaires au paiement.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Médiation de la consommation</h2>
          <p className={sectionBody}>
            En cas de litige non résolu, tu peux recourir gratuitement à un médiateur de la
            consommation : [médiateur à désigner — à compléter].
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Droit applicable et litiges</h2>
          <p className={sectionBody}>
            Ces conditions sont régies par le droit français.
          </p>
          <p className={updated}>Dernière mise à jour : [à compléter].</p>
        </section>
      </article>
    </PhoneShell>
  );
}
