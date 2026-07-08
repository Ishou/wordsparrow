import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
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
          <h1 className={title}>{t('v2.confidentialite.title')}</h1>
          <p className={lede}>{t('v2.confidentialite.lede')}</p>
        </header>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.confidentialite.collecte.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.confidentialite.collecte.p1.pre')}<strong>{t('v2.confidentialite.collecte.p1.strong')}</strong>{t('v2.confidentialite.collecte.p1.post')}
          </p>
          <div className={pillRow}>
            <span className={pill}>{t('v2.confidentialite.collecte.pill.local')}</span>
            <span className={pill}>{t('v2.confidentialite.collecte.pill.stats')}</span>
          </div>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.confidentialite.cookies.heading')}</h2>
          <p className={sectionBody}>{t('v2.confidentialite.cookies.p1')}</p>
          <p className={sectionBody}>{t('v2.confidentialite.cookies.p2')}</p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.confidentialite.facturation.heading')}</h2>
          <p className={sectionBody}>{t('v2.confidentialite.facturation.p1')}</p>
          <p className={sectionBody}>{t('v2.confidentialite.facturation.p2')}</p>
        </section>

        <section className={contentCard}>
          <h2 className={sectionHeading}>{t('v2.confidentialite.droits.heading')}</h2>
          <p className={sectionBody}>
            {t('v2.confidentialite.droits.pre')}<strong>ISHO IT</strong>{t('v2.confidentialite.droits.mid')}
            <a
              className={css({
                color: 'ws.sakuraDark',
                fontWeight: 'bold',
                textDecoration: 'underline',
              })}
              href="mailto:contact@wordsparrow.io"
            >
              contact@wordsparrow.io
            </a>
            {t('v2.confidentialite.droits.post')}
          </p>
        </section>

        <EraseData />
      </article>
    </PhoneShell>
  );
}
