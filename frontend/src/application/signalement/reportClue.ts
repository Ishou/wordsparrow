import type { SignalementInput, SurveyClient } from '@/application/survey';

export type ReportOutcome = 'reported' | 'already-reported';

// Records which (word, clue) pairs this client has already reported.
export interface SeenReportsStore {
  has(key: string): boolean;
  add(key: string): void;
}

// Per-(word,clue) guard: anonymous players can't be deduped server-side (ADR-0103).
export const reportGuardKey = (wordText: string, clueText: string): string =>
  `signalement:${wordText}:${clueText}`;

export async function reportClue(
  client: SurveyClient | null | undefined,
  seen: SeenReportsStore,
  input: SignalementInput,
): Promise<ReportOutcome> {
  if (!client) throw new Error('survey client unavailable');
  const key = reportGuardKey(input.wordText, input.clueText);
  if (seen.has(key)) return 'already-reported';
  await client.submitSignalement(input);
  seen.add(key);
  return 'reported';
}
