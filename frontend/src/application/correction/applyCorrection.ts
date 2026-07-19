import type { SurveyClient } from '@/application/survey';
import { SurveyDecisionFailed, SurveyUndoFailed } from './errors';
import type { CorrectionClient, CorrectionInput, CorrectionAccepted, CorrectionPreview, ReversedKind } from './types';

export interface ApplyCorrectionDeps {
  readonly correctionClient: CorrectionClient;
  readonly surveyClient: SurveyClient;
}

export interface ApplyCorrectionInput {
  readonly reportId: string;
  readonly correction: CorrectionInput;
}

// The grid write is durable, so a survey failure after the 202 surfaces SurveyDecisionFailed for a decision-only retry.
export async function applyCorrection(
  deps: ApplyCorrectionDeps,
  input: ApplyCorrectionInput,
): Promise<CorrectionAccepted> {
  const accepted = await deps.correctionClient.submitCorrection(input.correction);
  try {
    await deps.surveyClient.decideSignalement(input.reportId, 'action');
  } catch (cause) {
    throw new SurveyDecisionFailed(accepted.correctionId, accepted.backfillStatus, cause);
  }
  return accepted;
}

// Retry path for a correction whose grid write landed but whose survey decision failed.
export function markSignalementHandled(surveyClient: SurveyClient, reportId: string): Promise<void> {
  return surveyClient.decideSignalement(reportId, 'action');
}

// Dry-run impact shown in the Corriger sheet before applying (ADR-0108).
export function previewCorrection(
  correctionClient: CorrectionClient,
  oldClueText: string,
  wordText?: string,
): Promise<CorrectionPreview> {
  return correctionClient.previewCorrection(oldClueText, wordText);
}

export interface ReopenSignalementInput {
  readonly reportId: string;
  readonly oldClueText: string;
  readonly wordText?: string;
}

// Reopen a triaged report (ADR-0116): reverse its correction (grid), then reopen the report (survey). Grid-then-survey, mirroring applyCorrection.
export async function reopenSignalement(
  { correctionClient, surveyClient }: ApplyCorrectionDeps,
  input: ReopenSignalementInput,
): Promise<ReversedKind> {
  const reversedKind = await correctionClient.reverseCorrection(input.oldClueText, input.wordText);
  try {
    await surveyClient.undoSignalement(input.reportId);
  } catch (cause) {
    throw new SurveyUndoFailed(reversedKind, cause);
  }
  return reversedKind;
}
