import { css, cx } from 'styled-system/css';

export type NavKey = 'accueil' | 'grilles' | 'compte';

export interface BottomNavProps {
  readonly active: NavKey;
  readonly onNavigate?: (key: NavKey) => void;
}

const ITEMS: ReadonlyArray<{ key: NavKey; label: string; icon: string }> = [
  { key: 'accueil', label: 'Accueil', icon: '⌂' },
  { key: 'grilles', label: 'Grilles', icon: '▦' },
  { key: 'compte', label: 'Compte', icon: '☺' },
];

const nav = css({ display: 'flex', justifyContent: 'space-around', bg: 'white', paddingBlock: 'sm', borderRadius: 'md' });
const item = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  bg: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'ws.khaki',
  fontSize: 'xs',
  fontWeight: 'semibold',
});
const itemActive = css({ color: 'ws.sakura' });

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className={nav} aria-label="Navigation principale">
      {ITEMS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className={cx(item, key === active && itemActive)}
          aria-current={key === active ? 'page' : undefined}
          onClick={() => onNavigate?.(key)}
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
