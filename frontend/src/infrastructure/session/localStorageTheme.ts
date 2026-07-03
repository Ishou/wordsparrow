// Theme preference (ADR-0088). Storage failures degrade to the default, never throw.
import type { ThemePreference } from '@/application/session/ThemeStore';

export type { ThemePreference };

const KEY = 'bliss.theme';

export function loadThemePreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw === 'sombre' || raw === 'clair' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveThemePreference(pref: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(KEY, pref);
  } catch {
    // best-effort persistence
  }
}

function resolved(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'sombre') return 'dark';
  if (pref === 'auto' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

// Keeps the PWA status-bar/title-bar chrome in step with the resolved theme (hero-top hues).
const THEME_COLOR = { light: '#CDE9DA', dark: '#0E1F1A' } as const;

// Applies the preference to <html data-theme>; with 'auto' it tracks the OS scheme live.
export function applyThemePreference(pref: ThemePreference): void {
  const mode = resolved(pref);
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

export function watchSystemTheme(pref: ThemePreference): void {
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) return;
  if (mediaListener) mql.removeEventListener('change', mediaListener);
  mediaListener = null;
  if (pref !== 'auto') return;
  mediaListener = () => applyThemePreference('auto');
  mql.addEventListener('change', mediaListener);
}
