import { describe, expect, it } from 'vitest';
import { fr } from './messages.fr';
import { interpolate, t, type MessageKey } from './t';

describe('t() accessor', () => {
  it('returns a static message', () => {
    expect(t('home.previous.label')).toBe('Grilles précédentes');
  });

  it('interpolates {{params}}', () => {
    expect(t('home.cell.aria.started', { pct: 40 })).toBe(' — commencée — 40 %');
  });

  it('selects the singular plural form for count 1', () => {
    expect(t('lobby.players', { count: 1 })).toBe('1 joueur');
  });

  it('selects the plural form for count 2', () => {
    expect(t('lobby.players', { count: 2 })).toBe('2 joueurs');
  });

  it('treats count 0 as singular in French', () => {
    expect(t('lobby.players', { count: 0 })).toBe('0 joueur');
  });

  it('falls back to the key when it is missing', () => {
    expect(t('does.not.exist' as MessageKey)).toBe('does.not.exist');
  });

  it('throws in dev when a required param is missing (no {{x}} in speech)', () => {
    expect(() => t('home.cell.aria.started')).toThrow(/unresolved placeholder/);
  });
});

describe('interpolate()', () => {
  it('leaves an unresolved placeholder untouched when the param is absent', () => {
    expect(interpolate('bonjour {{name}}', {})).toBe('bonjour {{name}}');
  });
});

describe('catalog integrity', () => {
  const keys = Object.keys(fr);

  it('namespaces every key with a dot', () => {
    for (const k of keys) expect(k, k).toMatch(/\./);
  });

  it('pairs every plural key with its _one and _other forms', () => {
    const bases = new Set<string>();
    for (const k of keys) {
      const m = /^(.*)_(one|other|zero|two|few|many)$/.exec(k);
      if (m) bases.add(m[1]);
    }
    for (const base of bases) {
      expect(keys, `${base}_one`).toContain(`${base}_one`);
      expect(keys, `${base}_other`).toContain(`${base}_other`);
    }
  });

  it('has balanced {{ }} braces in every message', () => {
    for (const [k, v] of Object.entries(fr)) {
      const opens = (v.match(/\{\{/g) ?? []).length;
      const closes = (v.match(/\}\}/g) ?? []).length;
      expect(opens, k).toBe(closes);
    }
  });

  it('leaves no unresolved placeholder once declared params are supplied', () => {
    for (const [k, v] of Object.entries(fr)) {
      const names = [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      const params = Object.fromEntries(names.map((n) => [n, 'X']));
      expect(interpolate(v, params), k).not.toMatch(/\{\{/);
    }
  });
});
