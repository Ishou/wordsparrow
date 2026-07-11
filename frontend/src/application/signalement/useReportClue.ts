import { useCallback } from 'react';
import type { SignalementInput, SurveyClient } from '@/application/survey';

export type ReportOutcome = 'reported' | 'already-reported';

// One client-side guard per (word, clue): guests are anonymous and cannot be
// deduped server-side, so this stops a client re-reporting the same clue (ADR-0103).
const guardKey = (wordText: string, clueText: string): string =>
  `signalement:${wordText}:${clueText}`;

function alreadyReported(key: string): boolean {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

function markReported(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Private-mode / quota errors must not fail an otherwise-accepted report.
  }
}

export function useReportClue(client: SurveyClient | null | undefined): {
  readonly report: (input: SignalementInput) => Promise<ReportOutcome>;
} {
  const report = useCallback(
    async (input: SignalementInput): Promise<ReportOutcome> => {
      if (!client) throw new Error('survey client unavailable');
      const key = guardKey(input.wordText, input.clueText);
      if (alreadyReported(key)) return 'already-reported';
      await client.submitSignalement(input);
      markReported(key);
      return 'reported';
    },
    [client],
  );

  return { report };
}
