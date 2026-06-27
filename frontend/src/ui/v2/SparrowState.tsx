import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

// Centred state layout (empty / error / "bientôt"): scene slot + type scale + optional CTA.
const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 8px 8px' });
const art = css({ display: 'flex', justifyContent: 'center', marginBottom: '16px' });
const titleCss = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '22px', lineHeight: '1.1', color: 'ws.jadeInk' });
const bodyCss = css({ fontFamily: 'wsUi', fontWeight: 'semibold', fontSize: '14px', lineHeight: '1.45', color: 'ws.khaki', opacity: 0.8, marginTop: '8px', maxWidth: '300px' });
// Matches the home screen's primary CTA scale so actions read consistently across v2.
const ctaCss = css({
  marginTop: '22px',
  height: '52px',
  padding: '0 26px',
  border: 'none',
  borderRadius: '15px',
  bg: 'ws.sakura',
  color: 'white',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '16px',
  letterSpacing: '0.01em',
  cursor: 'pointer',
  boxShadow: '0 8px 18px rgba(212,93,131,0.32)',
  transition: 'transform 120ms, box-shadow 120ms',
  _active: { transform: 'translateY(1px)', boxShadow: '0 4px 12px rgba(212,93,131,0.30)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

export interface SparrowStateProps {
  readonly scene: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly cta?: { readonly label: string; readonly onClick: () => void };
  readonly as?: 'h1' | 'p';
}

export function SparrowState({ scene, title, body, cta, as: Tag = 'h1' }: SparrowStateProps) {
  return (
    <div className={wrap}>
      <div className={art}>{scene}</div>
      <Tag className={titleCss}>{title}</Tag>
      <p className={bodyCss}>{body}</p>
      {cta ? (
        <button type="button" className={ctaCss} onClick={cta.onClick}>
          {cta.label}
        </button>
      ) : null}
    </div>
  );
}
