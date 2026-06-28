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
    top: '12px',
    insetInlineStart: '12px',
    width: 'auto',
    height: 'auto',
    margin: 0,
    padding: '10px 16px',
    overflow: 'visible',
    clip: 'auto',
    whiteSpace: 'normal',
    borderRadius: '12px',
    bg: 'ws.jadeInk',
    color: 'white',
    fontFamily: 'wsUi',
    fontWeight: 'bold',
    fontSize: '14px',
    textDecoration: 'none',
    boxShadow: '0 6px 18px rgba(20,40,34,0.28)',
  },
});

export function SkipLink() {
  return (
    <a href="#main-content" className={skipLink}>
      Aller au contenu
    </a>
  );
}
