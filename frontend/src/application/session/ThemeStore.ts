// Theme-preference port (ADR-0088); adapter in @/infrastructure/session, consumed via router context (ADR-0002 §7).

export type ThemePreference = 'clair' | 'sombre' | 'auto';

export interface ThemeStore {
  /** Current persisted preference (default `'auto'`). */
  load(): ThemePreference;
  /** Persist the preference, apply it to the document and re-arm the OS watcher. */
  set(pref: ThemePreference): void;
}
