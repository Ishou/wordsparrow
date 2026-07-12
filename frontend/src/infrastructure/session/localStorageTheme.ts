// Theme preference (ADR-0088). Storage failures degrade to the default, never throw.
import type { ThemePreference } from '@/application/session/ThemeStore';

export type { ThemePreference };

const KEY = 'bliss.theme';

export function loadThemePreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    // Legacy 'auto' (and any unknown value) resolves to the light default.
    return raw === 'sombre' ? 'sombre' : 'clair';
  } catch {
    return 'clair';
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
  return pref === 'sombre' ? 'dark' : 'light';
}

// Keeps the PWA status-bar/title-bar chrome in step with the resolved theme (hero-top hues).
const THEME_COLOR = { light: '#CDE9DA', dark: '#0E1F1A' } as const;

// Applies the preference to <html data-theme>.
export function applyThemePreference(pref: ThemePreference): void {
  const mode = resolved(pref);
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}
