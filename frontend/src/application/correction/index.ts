// Application layer barrel for the maintainer clue-correction surface (ADR-0108).

export type {
  BackfillStatus,
  CorrectionAccepted,
  CorrectionClient,
  CorrectionInput,
  CorrectionKind,
  CorrectionProgress,
  ForbidClueCorrectionInput,
  ReplaceCorrectionInput,
} from './types';

export { LastClueForbidden, SurveyDecisionFailed } from './errors';

export type { ApplyCorrectionDeps, ApplyCorrectionInput } from './applyCorrection';
export { applyCorrection, markSignalementHandled } from './applyCorrection';
