// Theme preference (ADR-0088). Storage failures degrade to the default, never throw.

export type ThemePreference = 'clair' | 'sombre' | 'auto';

const KEY = 'bliss.theme';

export function loadThemePreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw === 'sombre' || raw === 'auto' ? raw : 'clair';
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
  if (pref === 'sombre') return 'dark';
  if (pref === 'auto' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

// Applies the preference to <html data-theme>; with 'auto' it tracks the OS scheme live.
export function applyThemePreference(pref: ThemePreference): void {
  document.documentElement.dataset.theme = resolved(pref);
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
