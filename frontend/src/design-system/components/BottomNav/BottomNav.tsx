import { House, GridFour, User, type Icon } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';

export type NavKey = 'accueil' | 'grilles' | 'compte';

export interface BottomNavProps {
  readonly active: NavKey;
  readonly onNavigate?: (key: NavKey) => void;
}

const ITEMS: ReadonlyArray<{ key: NavKey; label: string; icon: Icon }> = [
  { key: 'accueil', label: 'Accueil', icon: House },
  { key: 'grilles', label: 'Grilles', icon: GridFour },
  { key: 'compte', label: 'Compte', icon: User },
];

const nav = css({
  display: 'flex',
  justifyContent: 'space-around',
  bg: 'rgba(255,255,255,0.78)',
  backdropFilter: 'blur(14px)',
  border: '0.5px solid rgba(33,75,64,0.1)',
  paddingBlock: '10px',
  paddingInline: 'sm',
  borderRadius: '16px',
});
const item = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  bg: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'ws.jadeInk',
  opacity: 0.55,
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'bold',
});
const itemActive = css({ color: 'ws.sakura', opacity: 1, fontWeight: 'black' });

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className={nav} aria-label="Navigation principale">
      {ITEMS.map(({ key, label, icon: Glyph }) => (
        <button
          key={key}
          type="button"
          className={cx(item, key === active && itemActive)}
          aria-current={key === active ? 'page' : undefined}
          onClick={() => onNavigate?.(key)}
        >
          <Glyph aria-hidden="true" size={22} weight={key === active ? 'fill' : 'regular'} />
          {label}
        </button>
      ))}
    </nav>
  );
}
