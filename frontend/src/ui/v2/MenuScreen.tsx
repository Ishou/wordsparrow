import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  User,
  Gear,
  Moon,
  Question,
  FileText,
  ShieldCheck,
  CaretRight,
  type Icon,
} from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { PhoneShell } from './PhoneShell';
import { BackHeader } from './BackHeader';

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '28px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '4px 0 4px',
});
const lead = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  opacity: 0.8,
  marginBottom: '20px',
});

const list = css({ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', padding: 0, margin: 0 });

const rowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '13px',
  width: '100%',
  minHeight: '56px',
  padding: '10px 12px',
  borderRadius: '14px',
  textAlign: 'left' as const,
  fontFamily: 'wsUi',
  border: 'none',
  background: 'transparent',
};
const rowLink = css({
  ...rowBase,
  textDecoration: 'none',
  cursor: 'pointer',
  _hover: { bg: 'ws.sable' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const rowDisabled = css({ ...rowBase, cursor: 'default', opacity: 0.55 });

const iconTile = css({
  flex: 'none',
  width: '38px',
  height: '38px',
  borderRadius: '11px',
  bg: 'ws.jade',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'ws.jadeInk',
});
const iconTileSoft = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });

const labelWrap = css({ display: 'flex', flexDirection: 'column', minWidth: 0 });
const label = css({ fontSize: '16px', fontWeight: 'bold', color: 'ws.jadeInk' });
const soon = css({ fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85 });

const trailing = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.45, display: 'flex' });
const togglePlaceholder = css({
  marginLeft: 'auto',
  flex: 'none',
  width: '42px',
  height: '24px',
  borderRadius: '999px',
  bg: 'rgba(33,75,64,0.18)',
  position: 'relative',
  _after: {
    content: '""',
    position: 'absolute',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    bg: 'white',
    top: '3px',
    left: '3px',
  },
});

function Tile({ icon: I, soft }: { readonly icon: Icon; readonly soft?: boolean }) {
  return (
    <span className={soft ? cx(iconTile, iconTileSoft) : iconTile}>
      <I size={20} weight="bold" aria-hidden="true" />
    </span>
  );
}

function MenuLink({
  to,
  icon,
  children,
}: {
  readonly to: LinkProps['to'];
  readonly icon: Icon;
  readonly children: ReactNode;
}) {
  return (
    <li>
      <Link to={to} className={rowLink}>
        <Tile icon={icon} />
        <span className={labelWrap}>
          <span className={label}>{children}</span>
        </span>
        <span className={trailing}>
          <CaretRight size={18} weight="bold" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function MenuSoon({
  icon,
  soft,
  children,
}: {
  readonly icon: Icon;
  readonly soft?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li className={rowDisabled} aria-disabled="true">
      <Tile icon={icon} soft={soft} />
      <span className={labelWrap}>
        <span className={label}>{children}</span>
        <span className={soon}>Bientôt</span>
      </span>
    </li>
  );
}

export function MenuScreen() {
  return (
    <PhoneShell header={<BackHeader to="/" />}>
      <h1 className={title}>Menu</h1>
      <p className={lead}>Ton profil, tes réglages et les infos de l&apos;app.</p>

      <nav aria-label="Menu">
        <ul className={list}>
          <MenuSoon icon={User}>Mon compte</MenuSoon>
          <MenuSoon icon={Gear} soft>
            Réglages
          </MenuSoon>
          <li className={rowDisabled} aria-disabled="true">
            <Tile icon={Moon} soft />
            <span className={labelWrap}>
              <span className={label}>Mode sombre</span>
              <span className={soon}>Bientôt</span>
            </span>
            <span className={togglePlaceholder} aria-hidden="true" />
          </li>
          <MenuSoon icon={Question}>Aide</MenuSoon>
          <MenuLink to="/mentions-legales" icon={FileText}>
            Mentions légales
          </MenuLink>
          <MenuLink to="/confidentialite" icon={ShieldCheck}>
            Confidentialité
          </MenuLink>
        </ul>
      </nav>
    </PhoneShell>
  );
}
