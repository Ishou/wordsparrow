import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { Lock, FileText, Envelope, CaretRight, type Icon } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '26px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '0 0 14px',
});

const stack = css({ display: 'flex', flexDirection: 'column', gap: '16px' });

const profile = css({
  display: 'flex',
  alignItems: 'center',
  gap: '13px',
  bg: 'white',
  borderRadius: '18px',
  padding: '14px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});
const avatar = css({
  flex: 'none',
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  bg: 'ws.sakura',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '20px',
});
const profileName = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '17px', color: 'ws.jadeInk' });
const profileMeta = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.7, marginTop: '2px' });

const groupLabel = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#543C00',
  margin: '0 6px 7px',
});
const listCard = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  bg: 'white',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05)',
});

const rowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  minHeight: '48px',
  padding: '12px 14px',
  textAlign: 'left' as const,
  fontFamily: 'wsUi',
  border: 'none',
  borderBottom: '1px solid #EEF3EC',
  background: 'transparent',
};
const rowActive = css({ ...rowBase, textDecoration: 'none', cursor: 'pointer', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' } });
const lastFlat = css({ borderBottom: 'none' });

const tile = css({ flex: 'none', width: '30px', height: '30px', borderRadius: '9px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const tileSoft = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });

const label = css({ fontSize: '14px', fontWeight: 'bold', color: 'ws.jadeInk' });
const chevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });

const foot = css({ fontFamily: 'wsMono', fontSize: '11px', color: 'ws.khaki', opacity: 0.6, textAlign: 'center', paddingTop: '10px' });

function Tile({ icon: I, soft }: { readonly icon: Icon; readonly soft?: boolean }) {
  return (
    <span className={soft ? cx(tile, tileSoft) : tile}>
      <I size={16} weight="bold" aria-hidden="true" />
    </span>
  );
}

function LinkRow({ icon, soft, to, last, children }: { readonly icon: Icon; readonly soft?: boolean; readonly to: LinkProps['to']; readonly last?: boolean; readonly children: ReactNode }) {
  return (
    <li>
      <Link to={to} className={last ? cx(rowActive, lastFlat) : rowActive}>
        <Tile icon={icon} soft={soft} />
        <span className={label}>{children}</span>
        <span className={chevron}>
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function MailRow({ icon, href, last, children }: { readonly icon: Icon; readonly href: string; readonly last?: boolean; readonly children: ReactNode }) {
  return (
    <li>
      <a href={href} className={last ? cx(rowActive, lastFlat) : rowActive}>
        <Tile icon={icon} />
        <span className={label}>{children}</span>
        <span className={chevron}>
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </span>
      </a>
    </li>
  );
}

export function ReglagesScreen() {
  return (
    <PhoneShell header={<BackHeader to="/v2" />}>
      <div className={stack}>
        <h1 className={title}>Réglages</h1>

        <div className={profile}>
          <span className={avatar} aria-hidden="true">T</span>
          <div>
            <div className={profileName}>Toi</div>
            <div className={profileMeta}>Joueur invité</div>
          </div>
          <span className={chevron} aria-hidden="true">
            <CaretRight size={18} weight="bold" />
          </span>
        </div>

        <nav aria-label="Confidentialité &amp; légal">
          <div className={groupLabel}>Confidentialité &amp; légal</div>
          <ul className={listCard}>
            <LinkRow icon={Lock} soft to="/v2/confidentialite">Confidentialité</LinkRow>
            <LinkRow icon={FileText} soft to="/v2/mentions-legales" last>Mentions légales</LinkRow>
          </ul>
        </nav>

        <nav aria-label="Aide">
          <div className={groupLabel}>Aide</div>
          <ul className={listCard}>
            <MailRow icon={Envelope} href="mailto:contact@wordsparrow.io" last>Nous écrire</MailRow>
          </ul>
        </nav>

        <p className={foot}>WordSparrow · fait avec soin 🐦</p>
      </div>
    </PhoneShell>
  );
}
