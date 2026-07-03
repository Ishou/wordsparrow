import { css } from 'styled-system/css';

// The tappable list-row card (grilles archive, lobbies) — one source so the anatomy can't drift.
// The whole row is the tap target; a quiet chevron is the only affordance.

export const list = css({ listStyle: 'none', margin: 0, padding: 0 });

export const card = css({
  width: '100%',
  textAlign: 'left',
  textDecoration: 'none',
  bg: 'white',
  borderRadius: '16px',
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '10px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sable' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});

export const mid = css({ flex: 1, minWidth: 0 });
export const rowTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
export const rowMeta = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.85, marginTop: '2px' });
export const bar = css({ height: '7px', borderRadius: '999px', bg: 'rgba(33,75,64,0.1)', overflow: 'hidden', marginTop: '7px' });
export const barFill = css({ display: 'block', height: '100%', borderRadius: '999px', bg: 'ws.clueSurface' });
export const chevron = css({ flex: 'none', color: 'ws.khaki', opacity: 0.55 });
