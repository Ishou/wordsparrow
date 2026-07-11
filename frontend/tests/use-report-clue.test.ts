import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportClue } from '@/ui/components/grid/useReportClue';
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

describe('useReportClue (default localStorage store)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('submits once and records the guard key', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const { result } = renderHook(() => useReportClue(stubClient(submit)));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.report(input);
    });

    expect(outcome).toBe('reported');
    expect(submit).toHaveBeenCalledWith(input);
    expect(localStorage.getItem('signalement:CHAT:félin domestique')).not.toBeNull();
  });

  it('returns already-reported on a repeat without calling the client again', async () => {
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

  it('still submits when localStorage throws (private mode / quota)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    const { result } = renderHook(() => useReportClue(stubClient(submit)));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.report(input);
    });

    expect(outcome).toBe('reported');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
