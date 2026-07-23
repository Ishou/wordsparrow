// Skip-filled-cells typing-advance preference port; adapter in @/infrastructure/session, consumed via router context (ADR-0002 §7).

export interface SkipFilledStore {
  /** Current persisted preference (default `true` — skip already-filled cells on advance). */
  load(): boolean;
  /** Persist the preference. */
  set(enabled: boolean): void;
}
