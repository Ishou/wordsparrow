import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  watchSystemTheme,
} from '@/infrastructure/session/localStorageTheme';

const KEY = 'bliss.theme';

type Listener = (ev: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, l: EventListenerOrEventListenerObject) =>
      listeners.add(l as Listener),
    removeEventListener: (_type: string, l: EventListenerOrEventListenerObject) =>
      listeners.delete(l as Listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  globalThis.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    emit: (matches: boolean) => {
      (mql as { matches: boolean }).matches = matches;
      listeners.forEach((l) => l({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

function installThrowingStorage(): void {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('localStorage disabled');
  });
}

describe('localStorageTheme', () => {
  const originalMatchMedia = globalThis.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
    globalThis.matchMedia = originalMatchMedia;
  });

  describe('loadThemePreference', () => {
    it('defaults to auto when storage is empty', () => {
      expect(loadThemePreference()).toBe('auto');
    });

    it('defaults to auto when storage holds an invalid value', () => {
      window.localStorage.setItem(KEY, 'nuit');
      expect(loadThemePreference()).toBe('auto');
    });

    it('reads back clair, sombre and auto', () => {
      window.localStorage.setItem(KEY, 'clair');
      expect(loadThemePreference()).toBe('clair');
      window.localStorage.setItem(KEY, 'sombre');
      expect(loadThemePreference()).toBe('sombre');
      window.localStorage.setItem(KEY, 'auto');
      expect(loadThemePreference()).toBe('auto');
    });

    it('falls back to auto when localStorage throws', () => {
      installThrowingStorage();
      expect(loadThemePreference()).toBe('auto');
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

    it('resolves auto against matchMedia', () => {
      mockMatchMedia(true);
      applyThemePreference('auto');
      expect(document.documentElement.dataset.theme).toBe('dark');

      mockMatchMedia(false);
      applyThemePreference('auto');
      expect(document.documentElement.dataset.theme).toBe('light');
    });
  });

  describe('watchSystemTheme', () => {
    it('attaches a listener only for auto', () => {
      const m = mockMatchMedia(false);
      watchSystemTheme('clair');
      expect(m.listenerCount()).toBe(0);

      watchSystemTheme('auto');
      expect(m.listenerCount()).toBe(1);
    });

    it('re-applies the theme when the OS scheme changes while auto', () => {
      const m = mockMatchMedia(false);
      watchSystemTheme('auto');
      applyThemePreference('auto');
      expect(document.documentElement.dataset.theme).toBe('light');

      m.emit(true);
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('swaps the listener instead of stacking it across repeated calls', () => {
      const m = mockMatchMedia(false);
      watchSystemTheme('auto');
      watchSystemTheme('auto');
      watchSystemTheme('auto');
      expect(m.listenerCount()).toBe(1);
    });

    it('removes the listener when switching away from auto', () => {
      const m = mockMatchMedia(false);
      watchSystemTheme('auto');
      expect(m.listenerCount()).toBe(1);

      watchSystemTheme('clair');
      expect(m.listenerCount()).toBe(0);
    });

    it('does nothing when matchMedia is unavailable', () => {
      globalThis.matchMedia = undefined as unknown as typeof globalThis.matchMedia;
      expect(() => watchSystemTheme('auto')).not.toThrow();
    });
  });
});
