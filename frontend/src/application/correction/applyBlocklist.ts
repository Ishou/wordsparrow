import type { SurveyClient } from '@/application/survey';
import { SurveyDecisionFailed } from './errors';
import type { BlocklistPreview, BlocklistWordInput, CorrectionAccepted, CorrectionClient } from './types';

export interface ApplyBlocklistDeps {
  readonly correctionClient: CorrectionClient;
  readonly surveyClient: SurveyClient;
}

export interface ApplyBlocklistInput {
  readonly reportId: string;
  readonly blocklist: BlocklistWordInput;
}

// The grid write is durable, so a survey failure after the 202 surfaces SurveyDecisionFailed for a decision-only retry.
export async function applyBlocklist(
  deps: ApplyBlocklistDeps,
  input: ApplyBlocklistInput,
): Promise<CorrectionAccepted> {
  const accepted = await deps.correctionClient.blocklistWord(input.blocklist);
  try {
    await deps.surveyClient.decideSignalement(input.reportId, 'action');
  } catch (cause) {
    throw new SurveyDecisionFailed(accepted.correctionId, accepted.backfillStatus, cause);
  }
  return accepted;
}

export function previewBlocklist(correctionClient: CorrectionClient, word: string): Promise<BlocklistPreview> {
  return correctionClient.previewBlocklist(word);
}
