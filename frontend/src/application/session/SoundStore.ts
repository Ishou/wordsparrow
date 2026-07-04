// Sound-effects preference port; adapter in @/infrastructure/session, consumed via router context (ADR-0002 §7).

export interface SoundStore {
  /** Current persisted preference (default `true` — sounds on). */
  load(): boolean;
  /** Persist the preference. */
  set(enabled: boolean): void;
}
