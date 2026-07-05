import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSoundEnabled, saveSoundEnabled } from '@/infrastructure/session/localStorageSound';

describe('localStorageSound', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to enabled when nothing is stored', () => {
    expect(loadSoundEnabled()).toBe(true);
  });

  it('round-trips a disabled preference', () => {
    saveSoundEnabled(false);
    expect(loadSoundEnabled()).toBe(false);
  });

  it('round-trips a re-enabled preference', () => {
    saveSoundEnabled(false);
    saveSoundEnabled(true);
    expect(loadSoundEnabled()).toBe(true);
  });

  it('treats any non-"off" stored value as enabled', () => {
    localStorage.setItem('bliss.sound', 'garbage');
    expect(loadSoundEnabled()).toBe(true);
  });

  it('degrades to enabled when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSoundEnabled()).toBe(true);
  });
});
