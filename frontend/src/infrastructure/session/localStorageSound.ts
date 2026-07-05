// Grid sound-effects preference. Storage failures degrade to the default (on), never throw.

const KEY = 'bliss.sound';

export function loadSoundEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // best-effort persistence
  }
}
