import { describe, expect, it, vi } from 'vitest';
import { reportClue, reportGuardKey, type SeenReportsStore } from '@/application/signalement/reportClue';
import type { SignalementInput, SurveyClient } from '@/application/survey';

const input: SignalementInput = {
  wordText: 'CHAT',
  clueText: 'félin domestique',
  reason: 'erreur_sens',
  surface: 'solo',
};

function memoryStore(): SeenReportsStore {
  const set = new Set<string>();
  return { has: (k) => set.has(k), add: (k) => set.add(k) };
}

function stubClient(submit = vi.fn().mockResolvedValue({ reportId: 'r-1' })): SurveyClient {
  return { submitSignalement: submit } as unknown as SurveyClient;
}

describe('reportClue', () => {
  it('submits once and records the guard key', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const store = memoryStore();

    const outcome = await reportClue(stubClient(submit), store, input);

    expect(outcome).toBe('reported');
    expect(submit).toHaveBeenCalledWith(input);
    expect(store.has(reportGuardKey({ wordText: 'CHAT', clueText: 'félin domestique' }))).toBe(true);
  });

  it('refuses a second report for the same word+clue without calling the client', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const store = memoryStore();

    await reportClue(stubClient(submit), store, input);
    const outcome = await reportClue(stubClient(submit), store, input);

    expect(outcome).toBe('already-reported');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not record the guard when the client throws', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('boom'));
    const store = memoryStore();

    await expect(reportClue(stubClient(submit), store, input)).rejects.toThrow('boom');
    expect(store.has(reportGuardKey({ wordText: 'CHAT', clueText: 'félin domestique' }))).toBe(false);
  });

  it('throws when no client is available', async () => {
    await expect(reportClue(null, memoryStore(), input)).rejects.toThrow();
  });

  it('reports without a word and keys the guard on clue and puzzle', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const store = memoryStore();
    const wordless: SignalementInput = { clueText: 'définition offensante', reason: 'definition_offensante', surface: 'solo', puzzleId: 'p-9' };

    const outcome = await reportClue(stubClient(submit), store, wordless);

    expect(outcome).toBe('reported');
    expect(submit).toHaveBeenCalledWith(wordless);
    expect(store.has(reportGuardKey({ clueText: 'définition offensante', puzzleId: 'p-9' }))).toBe(true);
  });
});
