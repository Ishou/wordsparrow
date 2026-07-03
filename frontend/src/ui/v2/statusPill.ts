import { css } from 'styled-system/css';

// Uppercase status pill (subscription state, receipt state) — shared by the billing surfaces.
export const pill = css({ display: 'inline-flex', alignItems: 'center', lineHeight: 1, fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: '999px', padding: '4px 8px' });
export const pillPending = css({ color: 'ws.orInk', bg: 'ws.or' });
export const pillMuted = css({ color: 'ws.khaki', bg: 'rgba(33,75,64,0.08)' });
