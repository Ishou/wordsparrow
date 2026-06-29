import { type ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { CaretRight, type Icon } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

const rowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  minHeight: '52px',
  padding: '12px 14px',
  textAlign: 'left' as const,
  fontFamily: 'wsUi',
  border: 'none',
  borderBottom: '1px solid #EEF3EC',
  background: 'transparent',
};
const rowStatic = css(rowBase);
const rowActive = css({
  ...rowBase,
  textDecoration: 'none',
  cursor: 'pointer',
  _hover: { bg: 'ws.sable' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});
const lastFlat = css({ borderBottom: 'none' });

const tile = css({ flex: 'none', width: '34px', height: '34px', borderRadius: '10px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const tileSoft = css({ bg: 'ws.sakuraBlush', color: 'ws.sakuraDark' });

const body = css({ display: 'flex', flexDirection: 'column', minWidth: 0 });
const label = css({ fontSize: '14.5px', fontWeight: 'bold', color: 'ws.jadeInk' });
const sub = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '1px' });
const chevron = css({ marginLeft: 'auto', flex: 'none', color: 'ws.khaki', opacity: 0.5, display: 'flex' });

type SettingsRowProps = {
  readonly icon: Icon;
  readonly tone?: 'jade' | 'soft';
  readonly label: ReactNode;
  readonly sub?: ReactNode;
  readonly last?: boolean;
  readonly chevron?: boolean;
  readonly to?: LinkProps['to'];
  readonly href?: string;
  readonly onClick?: () => void;
};

function Inner({ icon: I, tone, label: labelNode, sub: subNode, showChevron }: { readonly icon: Icon; readonly tone: 'jade' | 'soft'; readonly label: ReactNode; readonly sub?: ReactNode; readonly showChevron: boolean }) {
  return (
    <>
      <span className={tone === 'soft' ? cx(tile, tileSoft) : tile}>
        <I size={18} weight="bold" aria-hidden="true" />
      </span>
      <span className={body}>
        <span className={label}>{labelNode}</span>
        {subNode != null ? <span className={sub}>{subNode}</span> : null}
      </span>
      {showChevron ? (
        <span className={chevron}>
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}

export function SettingsRow({ icon, tone = 'jade', label: labelNode, sub: subNode, last, chevron: chevronOverride, to, href, onClick }: SettingsRowProps) {
  const cls = last ? cx(rowActive, lastFlat) : rowActive;
  const interactive = to != null || href != null || onClick != null;
  const showChevron = chevronOverride ?? interactive;
  const inner = <Inner icon={icon} tone={tone} label={labelNode} sub={subNode} showChevron={showChevron} />;

  if (to != null) {
    return (
      <li>
        <Link to={to} className={cls}>{inner}</Link>
      </li>
    );
  }
  if (href != null) {
    const external = !href.startsWith('mailto:') && !href.startsWith('/');
    return (
      <li>
        <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>{inner}</a>
      </li>
    );
  }
  if (onClick != null) {
    return (
      <li>
        <button type="button" className={cls} onClick={onClick}>{inner}</button>
      </li>
    );
  }
  return (
    <li>
      <div className={last ? cx(rowStatic, lastFlat) : rowStatic}>{inner}</div>
    </li>
  );
}
