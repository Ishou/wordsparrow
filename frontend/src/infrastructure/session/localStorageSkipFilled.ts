// Skip-filled typing-advance preference. Storage failures degrade to the default (on), never throw.

const KEY = 'bliss.skipFilled';

export function loadSkipFilled(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSkipFilled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // best-effort persistence
  }
}
