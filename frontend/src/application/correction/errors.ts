import type { BackfillStatus } from './types';

// 409 from the grid correction surface — forbidding a word's only clue (ADR-0108 §2).
export class LastClueForbidden extends Error {
  constructor() {
    super('last clue forbidden');
    this.name = 'LastClueForbidden';
  }
}

// The correction was recorded (durable) but marking the report handled failed — retry the decision only.
export class SurveyDecisionFailed extends Error {
  readonly correctionId: string;
  readonly backfillStatus: BackfillStatus;
  constructor(correctionId: string, backfillStatus: BackfillStatus, cause?: unknown) {
    super('survey decision failed');
    this.name = 'SurveyDecisionFailed';
    this.correctionId = correctionId;
    this.backfillStatus = backfillStatus;
    this.cause = cause;
  }
}
