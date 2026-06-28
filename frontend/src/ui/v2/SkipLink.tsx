import { css } from 'styled-system/css';

// WCAG 2.4.1 (Bypass Blocks): the first focusable element on every v2 screen, letting keyboard users
// jump past the nav bar straight to #main-content. Visually hidden until focused.
const skipLink = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
  _focusVisible: {
    position: 'fixed',
    zIndex: 2000,
    top: '14px',
    insetInlineStart: '14px',
    width: 'auto',
    height: 'auto',
    margin: 0,
    padding: '12px 20px',
    overflow: 'visible',
    clip: 'auto',
    whiteSpace: 'normal',
    borderRadius: '999px',
    bg: 'ws.sakuraDark',
    color: 'white',
    fontFamily: 'wsUi',
    fontWeight: 'black',
    fontSize: '14px',
    textDecoration: 'none',
    boxShadow: '0 8px 18px rgba(212,93,131,0.32)',
    outline: '3px solid token(colors.ws.sakuraRose)',
    outlineOffset: '2px',
  },
});

export function SkipLink() {
  return (
    <a href="#main-content" className={skipLink}>
      Aller au contenu
    </a>
  );
}
