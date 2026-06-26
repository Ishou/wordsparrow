import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

export interface PhoneShellProps {
  readonly children: ReactNode;
  readonly header?: ReactNode;
}

// ADR-0072 phone-width column.
const shell = css({
  minHeight: '100dvh',
  bgImage: 'linear-gradient(180deg, #CDE9DA 0%, #BBE0CD 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'wsUi',
});

const frame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

const headerSlot = css({
  flex: 'none',
  padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0',
});

// The scrollable body owns the `<main>` landmark so v2 screens stay pure content bodies.
const body = css({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 22px calc(env(safe-area-inset-bottom) + 28px)',
});

export function PhoneShell({ children, header }: PhoneShellProps) {
  return (
    <div className={shell} lang="fr">
      <div className={frame}>
        {header != null ? <div className={headerSlot}>{header}</div> : null}
        <main id="main-content" className={body}>
          {children}
        </main>
      </div>
    </div>
  );
}
