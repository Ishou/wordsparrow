import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportClue } from '@/application/signalement/useReportClue';
import type { SignalementInput, SurveyClient } from '@/application/survey';

const input: SignalementInput = {
  wordText: 'CHAT',
  clueText: 'félin domestique',
  reason: 'erreur_sens',
  surface: 'solo',
};

function stubClient(submit = vi.fn().mockResolvedValue({ reportId: 'r-1' })): SurveyClient {
  return { submitSignalement: submit } as unknown as SurveyClient;
}

describe('useReportClue', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('submits once and records a localStorage guard key', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const { result } = renderHook(() => useReportClue(stubClient(submit)));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.report(input);
    });

    expect(outcome).toBe('reported');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(input);
    expect(localStorage.getItem('signalement:CHAT:félin domestique')).not.toBeNull();
  });

  it('refuses a second report for the same word+clue without calling the client', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const { result } = renderHook(() => useReportClue(stubClient(submit)));

    await act(async () => {
      await result.current.report(input);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.report(input);
    });

    expect(outcome).toBe('already-reported');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not set the guard when the client throws', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useReportClue(stubClient(submit)));

    await act(async () => {
      await expect(result.current.report(input)).rejects.toThrow('boom');
    });

    expect(localStorage.getItem('signalement:CHAT:félin domestique')).toBeNull();
  });

  it('throws when no client is available', async () => {
    const { result } = renderHook(() => useReportClue(null));
    await act(async () => {
      await expect(result.current.report(input)).rejects.toThrow();
    });
  });
});
