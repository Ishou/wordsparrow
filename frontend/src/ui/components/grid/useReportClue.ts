import { useCallback, useMemo } from 'react';
import type { SignalementInput, SurveyClient } from '@/application/survey';
import { reportClue, type ReportOutcome, type SeenReportsStore } from '@/application/signalement/reportClue';

// Default guard store: private-mode / quota errors must not fail an otherwise-accepted report.
function localStorageSeenStore(): SeenReportsStore {
  return {
    has: (key) => {
      try {
        return localStorage.getItem(key) != null;
      } catch {
        return false;
      }
    },
    add: (key) => {
      try {
        localStorage.setItem(key, new Date().toISOString());
      } catch {
        // ignore
      }
    },
  };
}

export function useReportClue(
  client: SurveyClient | null | undefined,
  store?: SeenReportsStore,
): { readonly report: (input: SignalementInput) => Promise<ReportOutcome> } {
  const seen = useMemo(() => store ?? localStorageSeenStore(), [store]);
  const report = useCallback(
    (input: SignalementInput) => reportClue(client, seen, input),
    [client, seen],
  );
  return { report };
}
