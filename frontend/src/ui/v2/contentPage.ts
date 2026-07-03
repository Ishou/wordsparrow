import { css } from 'styled-system/css';

export const eyebrow = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'ws.eyebrow',
  marginBottom: '6px',
});

export const lede = css({
  fontFamily: 'wsUi',
  fontSize: '14px',
  fontWeight: 'semibold',
  lineHeight: '1.6',
  color: 'ws.khaki',
  margin: 0,
});

export const contentCard = css({
  bg: 'ws.card',
  borderRadius: '18px',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});

export const sectionHeading = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '16px',
  color: 'ws.jadeInk',
  margin: '0 0 7px',
  _before: {
    content: '""',
    flex: 'none',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    bg: 'ws.sakura',
  },
});

export const sectionBody = css({
  fontFamily: 'wsUi',
  fontSize: '14px',
  lineHeight: '1.6',
  // encre sourde on card — ~7.4:1 on white (light) / ~7.1:1 on the night card (dark); the light hex is theme-blind so it needs a night pair.
  color: '#42594F',
  _dark: { color: '#AEB9AC' },
  margin: 0,
  '& strong, & b': { fontWeight: 'bold', color: 'ws.jadeInk' },
});
