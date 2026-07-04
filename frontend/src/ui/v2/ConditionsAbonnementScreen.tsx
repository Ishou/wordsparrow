import type { ReactNode } from 'react';
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

const bodyStack = css({ display: 'flex', flexDirection: 'column', gap: '10px' });

const offerList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  margin: '4px 0 0',
  padding: 0,
  listStyle: 'none',
  fontFamily: 'wsUi',
  fontSize: '14px',
  lineHeight: '1.5',
  color: 'ws.contentInk',
  '& strong': { fontWeight: 'bold', color: 'ws.jadeInk' },
});

const updated = css({
  fontFamily: 'wsUi',
  fontSize: '12px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  margin: 0,
});

function Article({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className={contentCard}>
      <h2 className={sectionHeading}>{heading}</h2>
      <div className={bodyStack}>{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className={sectionBody}>{children}</p>;
}

export function ConditionsAbonnementScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>Conditions générales de vente</h1>
          <p className={lede}>Abonnement WordSparrow — les règles de la souscription payante.</p>
          <p className={updated}>Dernière mise à jour : 4 juillet 2026 — Version 1.0</p>
        </header>

        <Article heading="Article 1 — Objet et champ d'application">
          <P>
            Les présentes Conditions Générales de Vente (les «&nbsp;CGV&nbsp;») régissent
            exclusivement la souscription, par un consommateur, d&apos;un abonnement payant au service
            en ligne WordSparrow (le «&nbsp;Service&nbsp;»), accessible à l&apos;adresse
            https://wordsparrow.io (le «&nbsp;Site&nbsp;»).
          </P>
          <P>
            Elles s&apos;appliquent à toute commande d&apos;un Abonnement, à l&apos;exclusion de tout
            autre document. Elles complètent les{' '}
            <Link className={link} to="/mentions-legales">
              Mentions légales
            </Link>{' '}
            et la{' '}
            <Link className={link} to="/confidentialite">
              Politique de confidentialité
            </Link>{' '}
            du Site.
          </P>
          <P>
            Les CGV s&apos;adressent aux consommateurs au sens de l&apos;article liminaire du Code de
            la consommation. Le fait de souscrire un Abonnement implique l&apos;acceptation pleine et
            entière des présentes CGV, dans leur version en vigueur au jour de la commande, par une
            case à cocher dédiée.
          </P>
        </Article>

        <Article heading="Article 2 — Identité du prestataire">
          <P>
            Le Service est édité et exploité par <strong>ISHO IT</strong>, EURL au capital de
            1&nbsp;000&nbsp;€, dont le siège social est situé 32 rue Avaulée, 92240 Malakoff (France).
            Immatriculée au RCS de Nanterre sous le n° 851&nbsp;880&nbsp;401 — SIRET
            851&nbsp;880&nbsp;401&nbsp;00019 — TVA intracommunautaire FR63&nbsp;851880401. Représentée
            par son gérant, Colin Auberger. Contact : contact@wordsparrow.io. Ci-après le
            «&nbsp;Prestataire&nbsp;».
          </P>
        </Article>

        <Article heading="Article 3 — Définitions">
          <P>
            <strong>Compte</strong> : espace personnel requis pour souscrire.{' '}
            <strong>Utilisateur</strong> : toute personne accédant au Site.{' '}
            <strong>Abonné</strong> : Utilisateur ayant souscrit un Abonnement payant.{' '}
            <strong>Abonnement</strong> : contrat à durée déterminée avec reconduction tacite donnant
            accès aux fonctionnalités payantes. <strong>Contenu Abonné</strong> : fonctionnalités et
            contenus réservés aux Abonnés. <strong>Contenu numérique</strong> : le Service et le
            Contenu Abonné, fournis sans support matériel (art. L224-25-1 du Code de la consommation).
          </P>
        </Article>

        <Article heading="Article 4 — Description des offres d'abonnement">
          <P>
            Le Service propose un accès gratuit à un ensemble de grilles de mots fléchés, dont une
            archive glissante librement consultable. L&apos;Abonnement donne accès au Contenu Abonné,
            comprenant l&apos;accès à l&apos;intégralité de l&apos;archive des grilles et la génération
            de vocabulaire personnalisé.
          </P>
          <ul className={offerList}>
            <li>
              <strong>Mensuel</strong> — 2,00&nbsp;€ TTC / mois, reconduction tacite mensuelle.
            </li>
            <li>
              <strong>Annuel</strong> — 20,00&nbsp;€ TTC / an, reconduction tacite annuelle.
            </li>
          </ul>
          <P>
            Le descriptif détaillé et à jour de chaque offre figure sur la page de souscription du
            Site, qui prévaut en cas de divergence. Toute réduction substantielle des fonctionnalités
            d&apos;une offre en cours ouvre à l&apos;Abonné un droit de résiliation sans frais dans les
            conditions de l&apos;article 14.
          </P>
        </Article>

        <Article heading="Article 5 — Prix">
          <P>
            Les prix sont indiqués en euros, toutes taxes comprises (TVA au taux de 20&nbsp;% incluse).
            Le prix applicable est celui affiché sur la page de souscription au moment de la validation
            de la commande.
          </P>
          <P>
            Toute modification tarifaire est sans effet sur l&apos;Abonnement en cours : elle ne
            s&apos;applique qu&apos;aux nouvelles souscriptions et aux reconductions postérieures. En
            cas de hausse de prix applicable à une reconduction, l&apos;Abonné en est informé sur
            support durable au plus tard un (1) mois avant l&apos;échéance, et peut résilier sans frais
            avant la prise d&apos;effet du nouveau tarif.
          </P>
        </Article>

        <Article heading="Article 6 — Création de compte">
          <P>
            La souscription suppose la création préalable d&apos;un Compte. L&apos;Utilisateur garantit
            l&apos;exactitude des informations fournies. Les identifiants sont personnels et
            confidentiels ; tout partage du Compte ou des accès réservés aux Abonnés avec un tiers est
            interdit.
          </P>
        </Article>

        <Article heading="Article 7 — Processus de commande et conclusion du contrat">
          <P>
            La commande se déroule ainsi : (1) sélection de l&apos;offre ; (2) connexion ou création du
            Compte ; (3) affichage d&apos;un récapitulatif détaillé (offre, prix TTC, périodicité, date
            de premier prélèvement, conditions de reconduction) ; (4) acceptation des présentes CGV et,
            le cas échéant, expression du consentement relatif au droit de rétractation (art. 13) ; (5)
            validation du paiement.
          </P>
          <P>
            Conformément à l&apos;article 1127-2 du Code civil, l&apos;Abonné peut vérifier le détail de
            sa commande et corriger d&apos;éventuelles erreurs avant de la confirmer définitivement
            («&nbsp;double clic&nbsp;»). La validation du paiement forme le contrat. Un courriel de
            confirmation récapitulant la commande et l&apos;accès aux présentes CGV est adressé à
            l&apos;Abonné sur support durable ; le contrat est archivé par le Prestataire et peut être
            communiqué à l&apos;Abonné sur demande.
          </P>
        </Article>

        <Article heading="Article 8 — Paiement">
          <P>
            Le paiement s&apos;effectue en ligne via le prestataire de paiement sécurisé Mollie (Mollie
            B.V.). Le Prestataire n&apos;a pas accès aux données bancaires complètes de l&apos;Abonné et
            ne les conserve pas. L&apos;Abonnement donnant lieu à reconduction tacite, l&apos;Abonné
            autorise le Prestataire, via Mollie, à prélever automatiquement le montant à chaque
            échéance, jusqu&apos;à résiliation.
          </P>
          <P>
            En cas d&apos;échec de paiement, le Prestataire peut suspendre l&apos;accès au Contenu
            Abonné après information de l&apos;Abonné. À défaut de régularisation dans un délai
            raisonnable, l&apos;Abonnement peut être résilié de plein droit.
          </P>
        </Article>

        <Article heading="Article 9 — Durée, prise d'effet et reconduction tacite">
          <P>
            L&apos;Abonnement prend effet à la validation du paiement, pour la durée de la période
            choisie (mensuelle ou annuelle). Il est reconduit tacitement à chaque échéance pour une
            durée identique, sauf résiliation dans les conditions de l&apos;article 14.
          </P>
          <P>
            Information légale (art. L215-1 et s. du Code de la consommation) : le Prestataire informe
            l&apos;Abonné, par écrit et sur support durable, au plus tôt trois (3) mois et au plus tard
            un (1) mois avant le terme de la période en cours, de la faculté de ne pas reconduire
            l&apos;Abonnement. À défaut, l&apos;Abonné peut résilier gratuitement à tout moment à
            compter de la reconduction ; les sommes versées pour une période postérieure à la
            résiliation lui sont remboursées, déduction faite de l&apos;exécution jusqu&apos;à la
            résiliation.
          </P>
        </Article>

        <Article heading="Article 10 — Fourniture du Service et disponibilité">
          <P>
            Le Contenu Abonné est accessible immédiatement après la souscription, sous réserve de
            l&apos;article 13. Le Prestataire est tenu d&apos;une obligation de moyens quant à
            l&apos;accessibilité et au bon fonctionnement du Service, sans garantir un fonctionnement
            ininterrompu.
          </P>
          <P>
            Le Prestataire peut suspendre temporairement l&apos;accès pour maintenance. Une
            indisponibilité prolongée qui lui est imputable pourra donner lieu à une prolongation de
            l&apos;Abonnement à due proportion. Il n&apos;est pas responsable des interruptions dues à
            un cas de force majeure, au fait d&apos;un tiers ou aux équipements de l&apos;Abonné.
          </P>
        </Article>

        <Article heading="Article 11 — Garantie légale de conformité">
          <P>
            Le Contenu Abonné est fourni conformément aux articles L224-25-1 et suivants du Code de la
            consommation relatifs à la garantie légale de conformité des contenus et services
            numériques. En cas de défaut de conformité, l&apos;Abonné a droit à la mise en conformité,
            ou à défaut à une réduction du prix ou à la résiliation. Cette garantie s&apos;applique
            indépendamment des présentes CGV et sans frais pour l&apos;Abonné.
          </P>
        </Article>

        <Article heading="Article 12 — Obligations de l'Abonné">
          <P>
            L&apos;Abonné s&apos;engage à utiliser le Service conformément à sa destination ; à ne pas
            partager, revendre ni mettre à disposition de tiers son accès ; à ne pas extraire,
            reproduire ou réutiliser de manière systématique ou substantielle les grilles, définitions
            ou bases de données (voir art. 15) ; et à ne pas porter atteinte à la sécurité ou à
            l&apos;intégrité du Service. Tout manquement grave peut entraîner la suspension ou la
            résiliation dans les conditions de l&apos;article 14.
          </P>
        </Article>

        <Article heading="Article 13 — Droit de rétractation">
          <P>
            En principe, l&apos;Abonné dispose d&apos;un délai de quatorze (14) jours à compter de la
            conclusion du contrat pour exercer son droit de rétractation, sans motif ni pénalité (art.
            L221-18 du Code de la consommation). Le formulaire type figure en Annexe 1.
          </P>
          <P>
            Renonciation en cas d&apos;accès immédiat (art. L221-28, 13° du Code de la consommation) :
            le Contenu Abonné étant un contenu numérique fourni sans support matériel dont
            l&apos;exécution commence immédiatement, l&apos;Abonné qui demande un accès immédiat est
            invité, lors de la commande, à (1) donner son accord exprès et préalable au commencement de
            l&apos;exécution avant la fin du délai de rétractation, et (2) reconnaître expressément
            renoncer à son droit de rétractation. Ce double consentement est recueilli par une case à
            cocher dédiée.
          </P>
          <P>
            Lorsque ces conditions sont réunies, l&apos;Abonné perd son droit de rétractation dès le
            début de la fourniture du Contenu Abonné ; la confirmation de cet accord lui est adressée
            sur support durable. À défaut d&apos;un tel consentement, l&apos;accès est différé
            jusqu&apos;à l&apos;expiration du délai de rétractation, ou l&apos;Abonné conserve son droit
            de rétractation dans les conditions de droit commun.
          </P>
        </Article>

        <Article heading="Article 14 — Résiliation">
          <P>
            <strong>14.1 — Résiliation par l&apos;Abonné (art. L215-1-1).</strong> L&apos;Abonné peut
            résilier son Abonnement à tout moment, gratuitement, au moyen de la fonctionnalité de
            résiliation en ligne accessible depuis son Compte. Cette fonctionnalité est accessible de
            manière directe et permanente et ne requiert aucune démarche plus contraignante que la
            souscription. Un récapitulatif est présenté avant validation, et la réception de la demande
            ainsi que la date de fin d&apos;effet sont confirmées sur support durable. La résiliation
            prend effet au terme de la période d&apos;abonnement en cours déjà réglée ; aucun
            remboursement de la période en cours n&apos;est dû, sous réserve des articles 5, 9, 11 et
            des dispositions légales impératives.
          </P>
          <P>
            <strong>14.2 — Résiliation par le Prestataire.</strong> Le Prestataire peut résilier de
            plein droit en cas de manquement grave de l&apos;Abonné (notamment art. 12) ou de défaut de
            paiement non régularisé, après mise en demeure restée sans effet pendant un délai
            raisonnable.
          </P>
        </Article>

        <Article heading="Article 15 — Propriété intellectuelle">
          <P>
            L&apos;ensemble des éléments du Service (grilles, définitions, contenus éditoriaux, marques,
            logos, interface, code) demeure la propriété exclusive du Prestataire ou de ses ayants
            droit. La base de données est protégée au titre du droit sui generis du producteur (art.
            L341-1 et s. du Code de la propriété intellectuelle) : toute extraction ou réutilisation
            substantielle est interdite. L&apos;Abonnement confère un droit d&apos;accès et d&apos;usage
            personnel, non exclusif et non transférable, pour la durée de l&apos;Abonnement.
          </P>
        </Article>

        <Article heading="Article 16 — Données personnelles">
          <P>
            Le responsable du traitement est ISHO IT (coordonnées à l&apos;article 2). Le traitement est
            décrit dans la{' '}
            <Link className={link} to="/confidentialite">
              Politique de confidentialité
            </Link>
            , qui précise les finalités, bases légales, durées de conservation et destinataires, ainsi
            que les droits de l&apos;Abonné (accès, rectification, effacement, opposition, portabilité,
            limitation). Pour toute question ou pour exercer ses droits, l&apos;Abonné peut écrire à
            contact@wordsparrow.io. Il dispose également du droit d&apos;introduire une réclamation
            auprès de la CNIL.
          </P>
        </Article>

        <Article heading="Article 17 — Modification des CGV">
          <P>
            Le Prestataire peut modifier les présentes CGV ; les CGV applicables sont celles en vigueur
            au jour de la commande ou de la reconduction. En cas de modification substantielle affectant
            un Abonnement en cours, l&apos;Abonné en est informé sur support durable avant sa prochaine
            échéance et peut, à défaut d&apos;acceptation, résilier sans frais avant la date
            d&apos;effet de la nouvelle version.
          </P>
        </Article>

        <Article heading="Article 18 — Réclamation et médiation">
          <P>
            Pour toute réclamation, l&apos;Abonné est invité à contacter préalablement le Prestataire à
            contact@wordsparrow.io afin de rechercher une solution amiable.
          </P>
          <P>
            Conformément aux articles L611-1 et suivants du Code de la consommation, l&apos;Abonné peut
            recourir gratuitement à un médiateur de la consommation, après une réclamation écrite
            préalable restée sans réponse satisfaisante et dans un délai d&apos;un an. Le médiateur
            compétent est AME Conso (Association des Médiateurs Européens), 197 boulevard Saint-Germain,
            75007 Paris —{' '}
            <a
              className={link}
              href="https://www.mediationconso-ame.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              mediationconso-ame.com
            </a>
            . Pour les litiges transfrontaliers, les consommateurs résidant dans l&apos;Union
            européenne peuvent s&apos;adresser au Centre Européen des Consommateurs France.
          </P>
        </Article>

        <Article heading="Article 19 — Droit applicable et juridiction">
          <P>
            Les présentes CGV sont soumises au droit français. À défaut de résolution amiable, tout
            litige relève des tribunaux compétents ; le consommateur peut notamment saisir la
            juridiction du lieu où il demeurait au moment de la conclusion du contrat (art. R631-3 du
            Code de la consommation).
          </P>
        </Article>

        <Article heading="Article 20 — Dispositions diverses">
          <P>
            La nullité d&apos;une stipulation n&apos;affecte pas la validité des autres. Le fait de ne
            pas se prévaloir d&apos;un manquement ne vaut pas renonciation à s&apos;en prévaloir
            ultérieurement. Les présentes CGV, avec les documents auxquels elles renvoient, expriment
            l&apos;intégralité de l&apos;accord entre les parties relatif à l&apos;Abonnement.
          </P>
        </Article>

        <Article heading="Annexe 1 — Formulaire type de rétractation">
          <P>
            (À compléter et renvoyer uniquement si vous souhaitez vous rétracter du contrat, et sous
            réserve de ne pas avoir renoncé à ce droit conformément à l&apos;article 13.)
          </P>
          <P>
            À l&apos;attention d&apos;ISHO IT — 32 rue Avaulée, 92240 Malakoff — contact@wordsparrow.io :
            je vous notifie par la présente ma rétractation du contrat portant sur l&apos;abonnement au
            service WordSparrow — commandé le [date], nom du consommateur [nom], adresse [adresse], date
            [date].
          </P>
        </Article>
      </article>
    </PhoneShell>
  );
}
