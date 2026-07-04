import { css } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';
import { EraseData } from './EraseData';
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

const pillRow = css({ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' });

const pill = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  color: 'ws.khaki',
  bg: 'ws.sable',
  borderRadius: '999px',
  padding: '5px 11px',
});

export function ConfidentialiteScreen() {
  return (
    <PhoneShell header={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>Confidentialité</h1>
          <p className={lede}>
            On garde les choses simples : le minimum de données, jamais de revente, et tu gardes la
            main.
          </p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Ce que l&apos;on collecte</h2>
          <p className={sectionBody}>
            Ta progression de jeu (mots trouvés, séries) est enregistrée{' '}
            <strong>sur ton appareil</strong>. Si tu as un compte, elle est aussi synchronisée sur
            ton compte pour te suivre d&apos;un appareil à l&apos;autre. On mesure des stats
            d&apos;usage anonymes pour améliorer le jeu.
          </p>
          <div className={pillRow}>
            <span className={pill}>Progression locale</span>
            <span className={pill}>Stats anonymes</span>
          </div>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Cookies</h2>
          <p className={sectionBody}>
            Aucun cookie publicitaire ni traceur tiers. La mesure d&apos;audience est anonyme et sans
            cookie : adresse IP tronquée, aucun recoupement entre sites, et le signal « Ne pas me
            pister » (Do Not Track) de ton navigateur est respecté.
          </p>
          <p className={sectionBody}>
            Cette mesure relève de l&apos;exemption de consentement prévue par la CNIL : il n&apos;y a
            donc pas de bandeau cookies à accepter.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Facturation et paiement</h2>
          <p className={sectionBody}>
            Quand tu te connectes, ton adresse e-mail est enregistrée — au titre d&apos;une
            obligation légale et de l&apos;exécution du contrat. Si tu prends un abonnement, elle sert
            à t&apos;envoyer la confirmation de ton contrat, tes reçus et les informations légales
            liées à ton abonnement (avis avant reconduction, changement de tarif).
          </p>
          <p className={sectionBody}>
            Pour gérer l&apos;abonnement et les paiements, cette adresse est transmise à notre
            prestataire de paiement, Mollie. Elle est conservée pendant la durée légale de
            conservation des documents comptables et n&apos;est jamais utilisée à des fins
            commerciales ni de prospection.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Tes droits</h2>
          <p className={sectionBody}>
            Accès, rectification, suppression, opposition, portabilité, limitation — c&apos;est toi
            qui décides. Le responsable de traitement est <strong>ISHO IT</strong> (voir les mentions
            légales). Pour exercer tes droits, écris à{' '}
            <a
              className={css({
                color: 'ws.sakuraDark',
                fontWeight: 'bold',
                textDecoration: 'underline',
              })}
              href="mailto:contact@wordsparrow.io"
            >
              contact@wordsparrow.io
            </a>{' '}
            ; tu peux aussi introduire une réclamation auprès de la CNIL. Si tu as un compte, tu peux
            effacer définitivement tes données serveur ci-dessous.
          </p>
        </section>

        <EraseData />
      </article>
    </PhoneShell>
  );
}
