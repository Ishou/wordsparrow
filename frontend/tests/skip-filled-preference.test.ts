import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSkipFilled, saveSkipFilled } from '@/infrastructure/session/localStorageSkipFilled';

const KEY = 'bliss.skipFilled';

function installThrowingStorage(): void {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
}

describe('localStorageSkipFilled', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('defaults to true when storage is empty', () => {
    expect(loadSkipFilled()).toBe(true);
  });

  it('reads back false only for the explicit off sentinel', () => {
    window.localStorage.setItem(KEY, 'off');
    expect(loadSkipFilled()).toBe(false);
    window.localStorage.setItem(KEY, 'on');
    expect(loadSkipFilled()).toBe(true);
  });

  it('falls back to true when localStorage throws', () => {
    installThrowingStorage();
    expect(loadSkipFilled()).toBe(true);
  });

  it('persists on/off under the bliss.skipFilled key', () => {
    saveSkipFilled(false);
    expect(window.localStorage.getItem(KEY)).toBe('off');
    saveSkipFilled(true);
    expect(window.localStorage.getItem(KEY)).toBe('on');
  });

  it('does not throw when localStorage throws', () => {
    installThrowingStorage();
    expect(() => saveSkipFilled(false)).not.toThrow();
  });
});
