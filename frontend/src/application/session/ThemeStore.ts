// Theme-preference port (ADR-0088); adapter in @/infrastructure/session, consumed via router context (ADR-0002 §7).

export type ThemePreference = 'clair' | 'sombre';

export interface ThemeStore {
  /** Current persisted preference (default `'clair'`). */
  load(): ThemePreference;
  /** Persist the preference and apply it to the document. */
  set(pref: ThemePreference): void;
}
