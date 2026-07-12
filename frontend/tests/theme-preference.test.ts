import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
} from '@/infrastructure/session/localStorageTheme';

const KEY = 'bliss.theme';

function installThrowingStorage(): void {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
}

describe('localStorageTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
  });

  describe('loadThemePreference', () => {
    it('defaults to clair when storage is empty', () => {
      expect(loadThemePreference()).toBe('clair');
    });

    it('defaults to clair when storage holds an invalid value', () => {
      window.localStorage.setItem(KEY, 'nuit');
      expect(loadThemePreference()).toBe('clair');
    });

    it('maps the legacy auto preference to clair', () => {
      window.localStorage.setItem(KEY, 'auto');
      expect(loadThemePreference()).toBe('clair');
    });

    it('reads back clair and sombre', () => {
      window.localStorage.setItem(KEY, 'clair');
      expect(loadThemePreference()).toBe('clair');
      window.localStorage.setItem(KEY, 'sombre');
      expect(loadThemePreference()).toBe('sombre');
    });

    it('falls back to clair when localStorage throws', () => {
      installThrowingStorage();
      expect(loadThemePreference()).toBe('clair');
    });
  });

  describe('saveThemePreference', () => {
    it('persists the preference under the bliss.theme key', () => {
      saveThemePreference('sombre');
      expect(window.localStorage.getItem(KEY)).toBe('sombre');
    });

    it('does not throw when localStorage throws', () => {
      installThrowingStorage();
      expect(() => saveThemePreference('sombre')).not.toThrow();
    });
  });

  describe('applyThemePreference', () => {
    it('resolves clair to the light theme', () => {
      applyThemePreference('clair');
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('resolves sombre to the dark theme', () => {
      applyThemePreference('sombre');
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('syncs the theme-color meta with the resolved mode', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
      try {
        applyThemePreference('clair');
        expect(meta.getAttribute('content')).toBe('#CDE9DA');
        applyThemePreference('sombre');
        expect(meta.getAttribute('content')).toBe('#0E1F1A');
      } finally {
        meta.remove();
      }
    });
  });
});
