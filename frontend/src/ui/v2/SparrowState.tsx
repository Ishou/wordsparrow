import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { PrimaryButton } from './Buttons';

// Centred state layout (empty / error / "bientôt"): scene slot + type scale + optional CTA.
const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 8px 8px' });
const art = css({ display: 'flex', justifyContent: 'center', marginBottom: '16px' });
const titleCss = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '22px', lineHeight: '1.1', color: 'ws.jadeInk' });
const bodyCss = css({ fontFamily: 'wsUi', fontWeight: 'semibold', fontSize: '14px', lineHeight: '1.45', color: 'ws.khaki', opacity: 0.8, marginTop: '8px', maxWidth: '300px' });
const ctaCss = css({ marginTop: '22px', padding: '0 26px' });

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
        <PrimaryButton className={ctaCss} fullWidth={false} onClick={cta.onClick}>
          {cta.label}
        </PrimaryButton>
      ) : null}
    </div>
  );
}
