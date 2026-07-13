import type { SignalementInput, SurveyClient } from '@/application/survey';

export type ReportOutcome = 'reported' | 'already-reported';

// Records which reports this client has already sent.
export interface SeenReportsStore {
  has(key: string): boolean;
  add(key: string): void;
}

// Local guard: anonymous players can't be deduped server-side (ADR-0103). Keyed on clue+puzzle (the client never holds the word, ADR-0111).
export const reportGuardKey = (input: Pick<SignalementInput, 'clueText' | 'puzzleId'>): string =>
  `signalement:${input.puzzleId ?? ''}:${input.clueText}`;

export async function reportClue(
  client: SurveyClient | null | undefined,
  seen: SeenReportsStore,
  input: SignalementInput,
): Promise<ReportOutcome> {
  if (!client) throw new Error('survey client unavailable');
  const key = reportGuardKey(input);
  if (seen.has(key)) return 'already-reported';
  await client.submitSignalement(input);
  seen.add(key);
  return 'reported';
}
