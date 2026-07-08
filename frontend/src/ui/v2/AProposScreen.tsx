import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
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
          <h1 className={title}>{t('v2.apropos.title')}</h1>
          <p className={lede}>{t('v2.apropos.lede')}</p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.projet.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.apropos.projet.p1.pre')}<strong>Colin Auberger</strong>{t('v2.apropos.projet.p1.post')}
          </p>
          <p className={sectionBody}>{t('v2.apropos.projet.p2')}</p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.ia.heading')}</h2>
          <p className={sectionBody}>{t('v2.apropos.ia.p1')}</p>
          <p className={sectionBody}>{t('v2.apropos.ia.p2')}</p>
          <p className={sectionBody}>{t('v2.apropos.ia.p3')}</p>
        </section>

        <section className={thanksCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.thanks.heading')}</h2>
          <p className={thanksText}>{t('v2.apropos.thanks.p1')}</p>
          <p className={thanksText}>{t('v2.apropos.thanks.p2')}</p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.code.heading')}</h2>
          <p className={sectionBody}>{t('v2.apropos.code.p1')}</p>
          <p className={sectionBody}>
            {t('v2.apropos.code.p2.pre')}
            <a className={link} href="/third-party-licenses.txt">
              {t('v2.apropos.code.p2.link')}
            </a>
            {t('v2.apropos.code.p2.post')}
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.letters.heading')}</h2>
          <p className={sectionBody}>{t('v2.apropos.letters.p1')}</p>
          <p className={sectionBody}>
            {t('v2.apropos.letters.p2.pre')}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Fredoka"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fredoka
            </a>
            {', '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Nunito"
              target="_blank"
              rel="noopener noreferrer"
            >
              Nunito
            </a>
            {', '}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Hanken+Grotesk"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hanken Grotesk
            </a>
            {t('v2.apropos.letters.p2.et')}
            <a
              className={link}
              href="https://fonts.google.com/specimen/Spline+Sans+Mono"
              target="_blank"
              rel="noopener noreferrer"
            >
              Spline Sans Mono
            </a>
            {t('v2.apropos.letters.p2.post')}
          </p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.apropos.langue.heading')}</h2>
          <p className={sectionBody}>{t('v2.apropos.langue.p1')}</p>
          <p className={sectionBody}>
            {t('v2.apropos.langue.p2.pre')}
            <a
              className={link}
              href="https://grammalecte.net"
              target="_blank"
              rel="noopener noreferrer"
            >
              Grammalecte
            </a>
            {t('v2.apropos.langue.p2.mid1')}<strong>Hunspell français</strong>{t('v2.apropos.langue.p2.mid2')}
            <a
              className={link}
              href="https://kaiko.getalp.org/about-dbnary/"
              target="_blank"
              rel="noopener noreferrer"
            >
              DBnary
            </a>
            {t('v2.apropos.langue.p2.post')}
          </p>
        </section>
      </article>
    </PhoneShell>
  );
}
