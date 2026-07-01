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
            Ta progression de jeu (mots trouvés, séries) reste <strong>sur ton appareil</strong>. On
            mesure des stats d&apos;usage anonymes pour améliorer le jeu.
          </p>
          <div className={pillRow}>
            <span className={pill}>Progression locale</span>
            <span className={pill}>Stats anonymes</span>
          </div>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Cookies</h2>
          <p className={sectionBody}>
            Strictement nécessaires + mesure d&apos;audience anonyme. Pas de pistage publicitaire.
          </p>
        </section>

        {/* DRAFT-à-valider — à confirmer avec le comptable/juridique */}
        <section className={contentCard}>
          <h2 className={sectionHeading}>Facturation et paiement</h2>
          <p className={sectionBody}>
            Quand tu te connectes, ton adresse e-mail est enregistrée puis conservée pour établir
            les factures et les reçus liés à un abonnement — au titre d&apos;une obligation légale
            et de l&apos;exécution du contrat. Elle est conservée pendant la durée légale de
            conservation des documents comptables.
          </p>
          <p className={sectionBody}>
            Pour gérer ton abonnement et t&apos;envoyer les reçus, cette adresse est transmise à
            notre prestataire de paiement, Mollie. Elle n&apos;est jamais utilisée à des fins
            commerciales ni de prospection.
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>Tes droits</h2>
          <p className={sectionBody}>
            Accès, rectification, suppression — c&apos;est toi qui décides. Si tu as un compte, tu peux
            effacer définitivement tes données serveur ci-dessous.
          </p>
        </section>

        <EraseData />
      </article>
    </PhoneShell>
  );
}
