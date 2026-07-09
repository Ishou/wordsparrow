import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { AppShell } from './AppShell';
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
    <AppShell variant="flow" topBar={<BackHeader to="/reglages" />} backTo="/reglages">
      <article className={stack}>
        <header>
          <div className={eyebrow}>{t('v2.aide.eyebrow')}</div>
          <h1 className={title}>{t('v2.aide.title')}</h1>
          <p className={lede}>{t('v2.aide.lede')}</p>
        </header>

        <Section heading={t('v2.aide.play.heading')}>
          {t('v2.aide.play.pre')}<kbd className={kbd}>{t('v2.aide.kbd.espace')}</kbd>{t('v2.aide.play.post')}
        </Section>

        <Section heading={t('v2.aide.shortcuts.heading')}>
          <kbd className={kbd}>← ↑ ↓ →</kbd>{t('v2.aide.shortcuts.move')}<kbd className={kbd}>{t('v2.aide.kbd.espace')}</kbd>{t('v2.aide.shortcuts.direction')}<kbd className={kbd}>{t('v2.aide.kbd.retour')}</kbd>{t('v2.aide.shortcuts.erase')}<kbd className={kbd}>Tab</kbd>{t('v2.aide.shortcuts.next')}
        </Section>

        <Section heading={t('v2.aide.validation.heading')}>{t('v2.aide.validation.body')}</Section>

        <Section heading={t('v2.aide.multi.heading')}>{t('v2.aide.multi.body')}</Section>

        <Section heading={t('v2.aide.install.heading')}>{t('v2.aide.install.body')}</Section>
      </article>
    </AppShell>
  );
}
