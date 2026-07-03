// Application-layer port for the theme preference (ADR-0088). The
// localStorage adapter lives in `@/infrastructure/session`; Réglages
// consumes this contract via the router context so `ui/` never imports
// `infrastructure/` directly (ADR-0002 §7).

export type ThemePreference = 'clair' | 'sombre' | 'auto';

export interface ThemeStore {
  /** Current persisted preference (default `'auto'`). */
  load(): ThemePreference;
  /** Persist the preference, apply it to the document and re-arm the OS watcher. */
  set(pref: ThemePreference): void;
}
