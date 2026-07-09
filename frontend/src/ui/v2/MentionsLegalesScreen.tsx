import { Link } from '@tanstack/react-router';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { AppShell } from './AppShell';
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

export function MentionsLegalesScreen() {
  return (
    <AppShell variant="flow" topBar={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <h1 className={title}>{t('v2.mentions.title')}</h1>
          <p className={lede}>{t('v2.mentions.lede')}</p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.editeur.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.mentions.editeur.p1.pre')}<strong>ISHO IT</strong>{t('v2.mentions.editeur.p1.mid')}<strong>RCS de Nanterre</strong>{t('v2.mentions.editeur.p1.post')}
          </p>
          <p className={sectionBody}>
            {t('v2.mentions.editeur.p2.pre')}<strong>Colin Auberger</strong>{t('v2.mentions.editeur.p2.mid')}
            <a className={link} href="mailto:contact@wordsparrow.io">
              contact@wordsparrow.io
            </a>
            .
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.hebergement.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.mentions.hebergement.pre')}<strong>Hetzner Online GmbH</strong>{t('v2.mentions.hebergement.mid1')}
            <a className={link} href="https://www.hetzner.com" target="_blank" rel="noopener noreferrer">
              hetzner.com
            </a>
            {t('v2.mentions.hebergement.mid2')}<strong>Cloudflare, Inc.</strong>{t('v2.mentions.hebergement.mid3')}
            <a className={link} href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">
              cloudflare.com
            </a>
            ).
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.pi.heading')}</h2>
          <p className={sectionBody}>{t('v2.mentions.pi.p1')}</p>
          <p className={sectionBody}>
            <a className={link} href="/third-party-licenses.txt">
              {t('v2.mentions.pi.p2.link1')}
            </a>
            {t('v2.mentions.pi.p2.mid')}
            <Link className={link} to="/a-propos">
              {t('v2.mentions.pi.p2.link2')}
            </Link>
            {t('v2.mentions.pi.p2.post')}
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.donnees.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.mentions.donnees.pre')}
            <Link className={link} to="/confidentialite">
              {t('v2.mentions.donnees.link')}
            </Link>
            .
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.mediation.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.mentions.mediation.pre')}<strong>AME Conso</strong>{t('v2.mentions.mediation.post')}
            <a
              className={link}
              href="https://www.mediationconso-ame.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              mediationconso-ame.com
            </a>
            ).
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.mentions.signaler.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.mentions.signaler.pre')}
            <a className={link} href="mailto:contact@wordsparrow.io">
              contact@wordsparrow.io
            </a>
            .
          </p>
        </section>
      </article>
    </AppShell>
  );
}
