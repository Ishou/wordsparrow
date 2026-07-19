// Application layer barrel for the maintainer clue-correction surface (ADR-0108).

export type {
  BackfillStatus,
  BlocklistPreview,
  CorrectionPreview,
  ReversedKind,
  BlocklistWordInput,
  CorrectionAccepted,
  CorrectionClient,
  CorrectionInput,
  CorrectionKind,
  CorrectionProgress,
  ForbidClueCorrectionInput,
  ReplaceCorrectionInput,
  WordClue,
} from './types';

export { LastClueForbidden, SurveyDecisionFailed, SurveyUndoFailed } from './errors';

export type { ApplyCorrectionDeps, ApplyCorrectionInput, ReopenSignalementInput } from './applyCorrection';
export { applyCorrection, markSignalementHandled, previewCorrection, reopenSignalement } from './applyCorrection';

export type { ApplyBlocklistDeps, ApplyBlocklistInput } from './applyBlocklist';
export { applyBlocklist, previewBlocklist } from './applyBlocklist';
